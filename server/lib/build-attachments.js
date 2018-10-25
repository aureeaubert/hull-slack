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

function getUserAttachment(user, color) {
  const fields = [
    `*Email:* ${user.email || "Unknown"}`,
    `*Phone:* ${user.phone || "Unknown"}`,
    `*Job title:* ${_.get(user.traits, 'job_title', 'Unknown')}`,
  ];

  return {
    mrkdwn_in: ["text", "fields", "pretext"],
    author_name: ":man: Personal Info",
    color: color(),
    fields,
    thumb_url: user.picture,
    text: fields.join('\n')
  };
}

function getAccountAttachment(account, color) {
  const fields = [
    `*Domain:* ${account.domain || account.email_domain || "Unknown"}`,
    `*Country:* ${account.address_country || "Unknown"}`
  ];

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

function getTraitsAttachments(user, color) {
  return _.reduce(
    _.pickBy(user, _.isPlainObject),
    (atts, value, key) => {
      if (_.isObject(value)) {
        atts.push({
          mrkdwn_in: ["text", "fields", "pretext"],
          author_name: `:globe_with_meridians: ${humanize(key)}`,
          text: formatObjToText(value),
          color: color(),
          fallback: key,
        });
      }
      return atts;
    },
    []
  );
}

function getWhitelistedUser({ user = {}, whitelist = [], hull }) {
  const whitelistedUser = _.pick(user, whitelist);
  return hull.utils.traits.group(whitelistedUser);
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
  changes = {},
  events = [],
  whitelist = [],
}) {
  const color = colorFactory();

  return {
    user: getUserAttachment(user, color),
    account: getAccountAttachment(account, color),
    segments: getSegmentAttachments(changes, segments, color),
    events: getEventsAttachements(events, color),
    changes: getChangesAttachment(changes, color),
    traits: getTraitsAttachments(user, color),
  };
};
