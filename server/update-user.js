// @flow
import _ from "lodash";
import userPayload from "./lib/user-payload";
import humanize from "./lib/humanize";
import setupChannels from "./lib/setup-channels";
import getSanitizedChannel from "./lib/get-sanitized-channel";
import { sayInPrivate } from "./bot";
import type { HullContext, ConnectSlackParams } from "./types";

const Promise = require('bluebird');
const Liquid = require('liquidjs');

async function interpolateText(message, hullUser) {
  return await Liquid().parseAndRender(message, {user: hullUser});
}

async function getSegmentMessages(segments, notifySegments, hullUser) {
  const enteredSegmentIds = _.map(_.get(segments, "entered", []), "id");
  const leftSegmentIds = _.map(_.get(segments, "left", []), "id");
  const messages = [];

  await Promise.each(notifySegments, async notifySegment => {
    const { segment, channel, enter, leave, message } = notifySegment;

    if (
      (enter && _.includes(enteredSegmentIds, segment))
      || (leave && _.includes(leftSegmentIds, segment))
    ) {
      messages.push({
        channel: getSanitizedChannel(channel),
        text: await interpolateText(message, hullUser)
      })
    }
  });

  return messages;
}

async function getEventMessages(events, notifyEvents, hullUser) {
  const messages = [];
  const eventNames = _.map(events, "event");

  await Promise.each(notifyEvents, async notifyEvent => {
    const { event, channel, message } = notifyEvent;

    if (_.includes(eventNames, event)) {
      messages.push({
        channel: getSanitizedChannel(channel),
        text: await interpolateText(message, hullUser)
      })
    }
  })

  return messages;
}

const getChannelIds = (teamChannels, channelNames) =>
  _.map(_.filter(teamChannels, t => _.includes(channelNames, t.name)), "id");

const getLoggableMessages = responses =>
  _.groupBy(_.compact(responses), "action");

const reduceActionUsers = actions =>
  _.reduce(
    actions,
    (m, v) => {
      m[v.user_id] = v.message;
      return m;
    },
    {}
  );

const processResponses = (hull, responses) =>
  _.map(getLoggableMessages(responses), (actions, name) => {
    hull.logger.info(`outgoing.user.${name}`, {
      user_ids: _.map(actions, "user_id"),
      data: reduceActionUsers(actions),
    });
  });

export default async function(
  connectSlack: Object => any,
  { client: hull, ship, metric, smartNotifierResponse }: HullContext,
  userMessages: Array<Object> = []
): Promise<any> {
  return Promise.map(userMessages, async userMessage => {
    const bot = connectSlack(({ hull, ship }: ConnectSlackParams));
    const { private_settings = {} } = ship;
    const {
      token = "",
      user_id = "",
      actions = [],
      notify_events = [],
      notify_segments = [],
      whitelist = [],
    } = private_settings;

    const { changes, events } = userMessage;
    const hullUser = _.cloneDeep(userMessage.user);
    hullUser.account = _.cloneDeep(userMessage.account);

    if (!hull || !hullUser.id || !token) {
      return hull.logger.info("outgoing.user.skip", {
        message: "Missing credentials",
        token: !!token
      });
    }

    const client = hull.asUser(_.pick(hullUser, "email", "id", "external_id"));

    const sendMessages = [];

    const fake_changes = {
      segments: {
        entered: [
          {
            id: "5b7e6d81b568798b9a0016d0"
          }
        ]
      }
    }

    const segmentMessages = await getSegmentMessages(fake_changes.segments, notify_segments, hullUser);
    client.logger.debug("outgoing.user.segments", segmentMessages);

    console.log("segmentMessages", segmentMessages);

    const eventMessages = await getEventMessages(events, notify_events, hullUser);
    client.logger.debug("outgoing.user.events", eventMessages);

    sendMessages.push(...segmentMessages, ...eventMessages);
    client.logger.debug("outgoing.user.messages", sendMessages);

    const sendChannels = _.map(sendMessages, "channel");
    client.logger.debug("outgoing.user.channels", sendChannels);

    console.log("sendMessages", sendMessages);

    if (!sendChannels.length) {
      return client.logger.info("outgoing.user.skip", {
        message: "No matching channels"
      })
    }

    const tellUser = (msg, error) => {
      client.logger.info("outgoing.user.error", { error, message: msg });
      sayInPrivate(bot, user_id, msg);
    };

    return setupChannels({
      hull,
      bot,
      app_token: token,
      channels: sendChannels,
    })
      .then(({ teamChannels, teamMembers }) => {
        const allChannels = _.concat(teamChannels, teamMembers);

        _.each(sendMessages, message => {
          const payload = userPayload({
            ...userMessage,
            hull,
            actions,
            message: message.text,
            whitelist
          });

          console.log("payload", payload);

          const channelId = _.get(
            _.filter(allChannels, ['name', message.channel.replace(/^@/, "")]),
            "[0].id"
          );

          console.log("channelId", channelId);

          client.logger.info("outgoing.user.success", {
            text: payload.text,
            channel: channelId
          });

          bot.say({ ...payload, channel: channelId });
        })
      })
      .catch(err => {
        tellUser(
          `:crying_cat_face: Something bad happened while posting to the channels :${
            err.message
          }`,
          err
        );
        client.logger.error("outgoing.user.error", {
          error: err.message,
        });
        return null;
      });
  }).then(responses => {
    if (smartNotifierResponse) {
      smartNotifierResponse.setFlowControl({
        type: "next",
        size: 100,
        in: 1,
      });
    }
    processResponses(hull, responses);
  });
}
