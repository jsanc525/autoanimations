import { debug } from "../constants/constants.js";
import { trafficCop } from "../router/traffic-cop.js";
import AAHandler from "../system-handlers/workflow-data.js";
import { getRequiredData } from "./getRequiredData.js";

const activityCache = {};
const modName = "Automated Animations";
const sysName = "Black Flag";
const checkVer = "1.9";
const sysMinVer = "2.0";

// Black Flag System hooks provided to run animations
export function systemHooks() {
   if (!foundry.utils.isNewerVersion(game.system.version, checkVer)) {
      return ui.notifications.error(
         `${modName}: This version of ${modName} requires ${sysName} ` + `${sysMinVer} or higher`,
         { permanent: true },
      );
   }
   Hooks.on("blackFlag.rollAttack", async (rolls, data) => {
      const roll = rolls[0];
      const hit = roll.total >= (roll.options.target ?? 0);
      const activity = data.subject;
      const actorHits = {};
      actorHits[activity.relativeID] = hit;
      if (activity?.description?.includes("[noaa]")) return;
      const playOnDamage = game.settings.get("autoanimations", "playonDamageCore");
      //TODO: Legacy filter check; verify if modern system needs AOE/Heal guards.
      //if (
      //   Object.keys(CONFIG.BlackFlag.areaTargetTypes).includes(activity?.target?.template?.type) ||
      //   (activity?.damage?.parts?.length && activity?.type != "heal" && playOnDamage)
      //) {
      //   return;
      //}
      const activityType = activity.type?.toLowerCase();
      //const hasDamage = activity.hasDamage || activity.system?.damage?.parts?.length > 0;
      const isHeal = activity.type === "heal";
      if (isHeal || playOnDamage) {
         debug("Black Flag | Heal/Damage Gate Triggered: Skipping Use animation to prevent double-play.");
         return;
      }
      const item = activity?.item;
      criticalCheck(roll, item);
      const ammoItem = item?.parent?.items?.get(data?.ammoUpdate?.id) ?? null;
      const overrideNames =
         activity?.name && !["heal", "summon"].includes(activity?.name?.trim()) ? [activity.name] : [];
      attackV2(
         await getRequiredData({
            item: item,
            actor: item.parent,
            activity,
            roll: item,
            rollAttackHook: { item, roll },
            spellLevel: roll?.data?.item?.level ?? void 0,
            ammoItem,
            overrideNames,
            hit,
         }),
      );
   });
   Hooks.on("blackFlag.postRollDamage", async (rolls, data) => {
      const roll = rolls[0];
      const activity = data.subject;
      //const hit = !!(activity.actorHits?.[activity.relativeID] ?? true);
      //if (actorHits) delete actorHits[activity.relativeID];
      if (activity?.description?.includes("[noaa]")) return;
      const playOnDamage = game.settings.get("autoanimations", "playonDamageCore");
      if (!playOnDamage) {
         return;
      }
      //TODO: Legacy filter check; verify if modern system needs AOE/Heal guards.
      //if (
      //   Object.keys(CONFIG.blackFlag.areaTargetTypes).includes(activity?.target?.template?.type) ||
      //   (activity?.type == "attack" && !playOnDamage)
      //) {
      //   return;
      //}

      const item = activity?.item;
      criticalCheck(roll, item);
      const overrideNames =
         activity?.name && !["heal", "summon"].includes(activity?.name?.trim()) ? [activity.name] : [];
      damageV2(
         await getRequiredData({
            item,
            actor: item.parent,
            activity,
            roll: item,
            rollDamageHook: { item, roll },
            spellLevel: roll?.data?.item?.level ?? void 0,
            overrideNames,
         }),
      );
   });
   Hooks.on("blackFlag.postActivityConsumption", async (activity, usageConfig, results) => {
      if (activity?.description?.includes("[noaa]")) return;
      const activityType = activity.type?.toLowerCase();
      const isAttack = activity.type === "attack";
      const hasDamage = activity.hasDamage || activity.system?.damage?.parts?.length > 0;
      const isHeal = activity.type === "heal";
      if (isAttack || hasDamage || isHeal) {
         debug("Black Flag | Gate Triggered: Skipping Use animation to prevent double-play.");
         return;
      }
      const config = usageConfig;
      const options = results;
      const item = activity?.item;
      const overrideNames =
         activity?.name && !["heal", "summon"].includes(activity?.name?.trim()) ? [activity.name] : [];
      useItem(
         await getRequiredData({
            item,
            actor: item.parent,
            activity,
            roll: item,
            useItemHook: { item, config, options },
            spellLevel: options?.data?.flags?.["black-flag"]?.spellSlot || void 0,
            overrideNames,
         }),
      );
   });
   Hooks.on("blackFlag.preActivityConsumption", (activity, config) => {
      if (activity?.description?.includes("[noaa]")) return;
      //TODO: Blackflag does not currently autodelete items
      //if (activity.item?.system?.uses?.autoDestroy) activityCache[activity.uuid] = activity;
      //setTimeout(() => {
      //   if (activityCache[activity.uuid]) delete activityCache[activity.uuid];
      //}, 60000);
   });
   //TODO
   Hooks.on("createMeasuredTemplate", async (template, data, userId) => {
      console.log("AA DEBUG | Hook Triggered");
      if (userId !== game.user.id) {
         console.log("AA DEBUG | Exit: Wrong User");
         return;
      }
      const activity =
         fromUuidSync(template.flags?.["black-flag"]?.origin) ?? activityCache[template.flags?.["black-flag"]?.origin];
      if (!activity) {
         console.log("AA DEBUG | Exit: No Activity found for UUID");
         return;
      }
      if (activity?.description?.includes("[noaa]")) {
         console.log("AA DEBUG | Exit: [noaa] tag detected");
         return;
      }
      console.log("AA DEBUG | Proceeding to templateAnimation with activity:", activity.name);
      const item = activity?.item;
      const overrideNames =
         activity?.name && !["heal", "summon"].includes(activity?.name?.trim()) ? [activity.name] : [];
      templateAnimation(
         await getRequiredData({
            item,
            activity,
            templateData: template,
            roll: template,
            isTemplate: true,
            overrideNames,
         }),
      );
   });
}

async function useItem(input) {
   debug("Item used, checking for animations");
   const handler = await AAHandler.make(input);
   if (!handler?.item || !handler?.sourceToken) {
      console.log("Automated Animations: No Item or Source Token", handler);
      return;
   }
   trafficCop(handler);
}

async function attackV2(input) {
   checkReach(input);
   debug("Attack rolled, checking for animations");
   const handler = await AAHandler.make(input);
   if (!handler?.item || !handler?.sourceToken) {
      console.log("Automated Animations: No Item or Source Token", handler);
      return;
   }
   trafficCop(handler);
}

async function damageV2(input) {
   checkReach(input);
   debug("Damage rolled, checking for animations");
   const handler = await AAHandler.make(input);
   if (!handler?.item || !handler?.sourceToken) {
      console.log("Automated Animations: No Item or Source Token", handler);
      return;
   }
   trafficCop(handler);
}
//TODO
async function templateAnimation(input) {
   debug("Template placed, checking for animations");
   if (!input.item) {
      debug("No Item could be found");
      return;
   }
   const handler = await AAHandler.make(input);
   trafficCop(handler);
}

function checkReach(data) {
   data.reach = data.item.system?.properties?.rch ? 1 : 0;
}

function criticalCheck(roll, item = {}) {
   if (!roll.isCriticalSuccess && !roll.isCriticalFailure) {
      return;
   }
   debug("Checking for Crit or Fumble");
   const critical = roll.isCriticalSuccess;
   const fumble = roll.isCriticalFailure;
   const token = canvas.tokens.get(roll.tokenId) || getTokenFromItem(item);

   const critAnim = game.settings.get("autoanimations", "CriticalAnimation");
   const critMissAnim = game.settings.get("autoanimations", "CriticalMissAnimation");

   switch (true) {
      case game.settings.get("autoanimations", "EnableCritical") && critical:
         new Sequence({ moduleName: "Automated Animations", softFail: !game.settings.get("autoanimations", "debug") })
            .effect()
            .file(critAnim)
            .atLocation(token)
            .play();
         break;
      case game.settings.get("autoanimations", "EnableCriticalMiss") && fumble:
         new Sequence({ moduleName: "Automated Animations", softFail: !game.settings.get("autoanimations", "debug") })
            .effect()
            .file(critMissAnim)
            .atLocation(token)
            .play();
         break;
   }

   function getTokenFromItem(item) {
      const token = item?.parent?.token;
      if (token) return token;
      const tokens = canvas.tokens.placeables.filter((token) => token.actor?.items?.get(item.id));
      const fallBack = tokens[0];
      const mostLikely = tokens.find((x) => x.id === _token.id);
      return mostLikely ?? fallBack;
   }
}
