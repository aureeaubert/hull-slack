//@noflow
import _ from "lodash";
import moment from "moment";
import humanize from "./humanize";
// import flags from "./flags";
import getUserName from "./get-user-name";
import format from "./format-value";

const MOMENT_FORMAT = "MMMM Do YYYY, h:mm:ss a";

function formatObjToText(ob) {
  return _.join(
    _.map(format(_.omit(ob, "id")), p => `*${p.title}*: ${p.value}`),
    "\n"
  );
}

function colorFactory() {
  const COLORS = ["#83D586", "#49A2E1", "#FF625A", "#E57831", "#4BC2B8", "#4BC2B8"];
  let i = -1;
  const l = COLORS.length;
  return function cycle() {
    i += 1;
    return COLORS[i % l];
  };
}

const FORMATTER = [
  {
    title: "Email",
    value: email => `${email}`,
    short: true,
  },
  {
    key: "Phone",
    value: phone => `${phone}`,
    short: true
  }
  // {
  //   key: "address_country",
  //   value: (address = {}, user) => `${flags(user.address_country)} ${_.join(_.compact([user.address_country, user.address_state, user.address_city]), ", ")}`,
  //   short: false
  // },
  // {
  //   key: "first_seen_at",
  //   value: first_seen_at => `:stopwatch: *First Seen*: ${moment(first_seen_at).format(MOMENT_FORMAT)}`,
  //   short: false
  // },
  // {
  //   key: "created_at",
  //   value: created_at => `:stopwatch: *Signup*: ${moment(created_at).format(MOMENT_FORMAT)}`,
  //   short: false
  // }
];

function getHumanizedAttributeName(attribute) {
  return _.get(attribute.match(/^traits_(.*)/), "[1]", attribute);
}

function getAttributeValue(object, attribute) {
  const value = _.get(object, attribute, "Unknown");

  if (_.isArray(value)) {
    return value.join(', ');
  }

  return value;
}

function getUserAttachment(user, userAttributes, color) {
  if (_.isEmpty(userAttributes)) {
    return; 
  }

  const fields = _.map(userAttributes, attribute => {
    return `*${getHumanizedAttributeName(attribute)}:* ${getAttributeValue(user, attribute)}`
  });

  return {
    mrkdwn_in: ["text", "fields", "pretext"],
    author_name: ":man: Personal Info",
    color: color(),
    text: fields.join('\n')
  };
}

function getAccountAttachment(account, accountAttributes, color) {
  if (_.isEmpty(accountAttributes)) {
    return;
  }

  const fields = _.map(accountAttributes, attribute => {
    return `*${getHumanizedAttributeName(attribute)}:* ${getAttributeValue(account, attribute)}`;
  });

  return {
    mrkdwn_in: ["text", "fields", "pretext"],
    author_name: ":office: Company Info",
    color: color(),
    text: fields.join('\n')
  };
}

function getChangesAttachment(changes, color) {
  return !_.size(changes.user)
    ? {}
    : {
        author_name: ":chart_with_upwards_trend: Changes",
        mrkdwn_in: ["text", "fields", "pretext"],
        color: color(),
        fallback: `Changes: ${_.keys(changes.user || {}).join(", ")}`,
        text: formatObjToText(
          _.mapValues(changes.user, v => `${v[0]} → ${v[1]}`)
        ),
      };
}

function getSegmentAttachments(changes = {}, segments, color) {
  const segmentString = (_.map(segments, "name") || []).join(", ");
  return {
    author_name: ":busts_in_silhouette: Segments",
    text: segmentString,
    fallback: `Segments: ${segmentString}`,
    color: color(),
    fields: _.map(changes.segments, (segs, action) => {
      const names = _.map(segs, "name");
      const emoji = `:${action === "left" ? "outbox" : "inbox"}_tray:`;
      return {
        title: `${emoji} ${humanize(action)} segment${
          names.length > 1 ? "s" : ""
        }`,
        value: names.join(", "),
      };
    }),
  };
}

function getEventsAttachements(events = [], color) {
  if (!events.length) return {};
  return _.map(events, e => {
    try {
      const { days_since_signup: ds } = e.context || {};
      const actions = [];
      if (e.props && e.props.length) {
        actions.push({
          name: "expand",
          value: "event",
          text: "Show Properties",
          type: "button",
        });
      }
      return {
        title: `:star: ${e.event}`,
        ts: moment(e.created_at).format("X"),
        footer: `:clock2: ${ds} day${Math.abs(ds) === 1 ? "" : "s"} ${
          ds >= 0 ? "after" : "before"
        } signup`,
        fallback: e.event,
        color: color(),
        actions,
        callback_id: e._id,
        attachment_type: "default",
        mrkdwn_in: ["text", "fields", "pretext"],
      };
    } catch (err) {
      console.log(err);
    }
    return true;
  });
}

module.exports = function buildAttachments({
  hull,
  user = {},
  account = {},
  segments = [],
  attributes = [],
  changes = {},
  events = [],
  whitelist = [],
}) {
  const color = colorFactory();
  const userAttributes = _.filter(attributes, attribute => {
    return !attribute.match(/^account./);
  });
  const accountAttributes = _.map(
    _.filter(attributes, attribute => {
      return attribute.match(/^account./);
    }), attribute => {
      return attribute.match(/^account.(.*)/)[1]
    }
  );

  return {
    user: getUserAttachment(user, userAttributes, color),
    account: getAccountAttachment(account, accountAttributes, color),
    segments: getSegmentAttachments(changes, segments, color),
    events: getEventsAttachements(events, color),
    changes: getChangesAttachment(changes, color),
  };
};
