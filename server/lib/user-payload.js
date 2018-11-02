//@noflow
import _ from "lodash";
import buildAttachments from "./build-attachments";
import getUserName from "./get-user-name";

function urlFor(user = {}, organization) {
  const [namespace, domain, tld] = organization.split(".");
  return `https://dashboard.${domain}.${tld}/${namespace}/users/${user.id}`;
}

function cast(v) {
  if (_.isString(v)) {
    // Boolean
    let V = v.toLowerCase();
    if (V === "true" || V === "false") return V === "true";

    // Number
    V = Number(v);
    if (!_.isNaN(V)) return V;
  }
  return v;
}

const getActions = (user, traits, events, actions, group = "") => ({
  title: `Actions for ${user.name || user.email}`,
  fallback: "Can't show message actions",
  attachment_type: "default",
  mrkdwn_in: ["text", "fields", "pretext"],
  callback_id: user.id,
  actions: [
    ..._.map(
      _.filter(
        actions,
        a => a.label !== "" && a.property !== "" && a.value !== "",
        a => {
          return {
            name: "trait",
            value: JSON.stringify({
              [a.property.replace(/^traits_/, "")]: cast(a.value),
            }),
            text: a.label,
            type: "button",
          };
        }
      )
    ),
    {
      name: "expand",
      style: group === "events" ? "primary" : "default",
      value: "events",
      text: "Show latest events",
      type: "button",
    },
    {
      name: "expand",
      style: group === "traits" ? "primary" : "default",
      value: "traits",
      text: "Show all attributes",
      type: "button",
    },
  ],
});

module.exports = function userPayload({
  hull,
  user = {},
  account = {},
  events = [],
  segments = {},
  changes = [],
  actions = [],
  whitelist = [],
  message = "",
  attributes = ["email", "job_title", "account.domain", "account.address_country"],
  group = "",
}) {
  const user_url = urlFor(user, hull.configuration().organization);
  const w = group ? [] : whitelist;
  const atts = buildAttachments({
    hull,
    user,
    account,
    segments,
    attributes,
    changes,
    events,
    whitelist: w,
  });
  const name = getUserName(user);

  // common items;
  const attachments = [];

  if (!_.isNil(atts.user)) {
    attachments.push(atts.user);
  }

  if (!_.isNil(atts.account)) {
    attachments.push(atts.account);
  }

  if (!message) {
    attachments.push(atts.segments);
    attachments.push(atts.changes);
  }

  return {
    text: message || `*<${user_url}|${name}>*`,
    attachments
  };
};
