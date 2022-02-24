import type { ActorPF2e } from "@actor/base";
import { CreaturePF2e } from "@actor";
import { DC_SLUGS, SKILL_EXPANDED } from "@actor/data/values";
import {
    ensureProficiencyOption,
    CheckModifier,
    StatisticModifier,
    ModifierPF2e,
    MODIFIER_TYPE,
} from "@module/modifiers";
import { CheckPF2e } from "../rolls";
import { Statistic, StatisticDataWithDC } from "@system/statistic";
import { RollNotePF2e } from "@module/notes";
import { CheckDC, DegreeOfSuccessString, DEGREE_OF_SUCCESS_STRINGS } from "@system/degree-of-success";
import { seek } from "./basic/seek";
import { senseMotive } from "./basic/sense-motive";
import { balance } from "./acrobatics/balance";
import { maneuverInFlight } from "./acrobatics/maneuver-in-flight";
import { squeeze } from "./acrobatics/squeeze";
import { tumbleThrough } from "./acrobatics/tumble-through";
import { climb } from "./athletics/climb";
import { disarm } from "./athletics/disarm";
import { forceOpen } from "./athletics/force-open";
import { grapple } from "./athletics/grapple";
import { highJump } from "./athletics/high-jump";
import { longJump } from "./athletics/long-jump";
import { shove } from "./athletics/shove";
import { swim } from "./athletics/swim";
import { trip } from "./athletics/trip";
import { whirlingThrow } from "./athletics/whirling-throw";
import { craft } from "@system/actions/crafting/craft";
import { createADiversion } from "./deception/create-a-diversion";
import { feint } from "./deception/feint";
import { impersonate } from "./deception/impersonate";
import { lie } from "./deception/lie";
import { bonMot } from "./diplomacy/bon-mot";
import { gatherInformation } from "./diplomacy/gather-information";
import { makeAnImpression } from "./diplomacy/make-an-impression";
import { request } from "./diplomacy/request";
import { coerce } from "./intimidation/coerce";
import { demoralize } from "./intimidation/demoralize";
import { hide } from "./stealth/hide";
import { sneak } from "./stealth/sneak";
import { pickALock } from "./thievery/pick-a-lock";
import { PredicatePF2e } from "@system/predication";
import { WeaponPF2e } from "@item/weapon";
import { WeaponTrait } from "@item/weapon/data";
import { setHasElement } from "@util";

type CheckType = "skill-check" | "perception-check" | "saving-throw" | "attack-roll";

export type ActionGlyph = "A" | "D" | "T" | "R" | "F" | "a" | "d" | "t" | "r" | "f" | 1 | 2 | 3 | "1" | "2" | "3";

export interface ActionDefaultOptions {
    event: JQuery.TriggeredEvent;
    actors?: ActorPF2e | ActorPF2e[];
    glyph?: ActionGlyph;
    modifiers?: ModifierPF2e[];
}

export interface SkillActionOptions extends ActionDefaultOptions {
    skill?: string;
    difficultyClass?: CheckDC;
}

export interface CheckResultCallback {
    actor: ActorPF2e;
    message?: ChatMessage;
    outcome: typeof DEGREE_OF_SUCCESS_STRINGS[number] | null | undefined;
    roll: Rolled<Roll>;
}

interface SimpleRollActionCheckOptions {
    actors: ActorPF2e | ActorPF2e[] | undefined;
    statName: string;
    actionGlyph: ActionGlyph | undefined;
    title: string;
    subtitle: string;
    modifiers: ModifierPF2e[] | undefined;
    rollOptions: string[];
    extraOptions: string[];
    traits: string[];
    checkType: CheckType;
    event: JQuery.TriggeredEvent;
    difficultyClass?: CheckDC;
    difficultyClassStatistic?: (creature: CreaturePF2e) => Statistic<StatisticDataWithDC>;
    extraNotes?: (selector: string) => RollNotePF2e[];
    callback?: (result: CheckResultCallback) => void;
    createMessage?: boolean;
    weaponTrait?: WeaponTrait;
    weaponTraitWithPenalty?: WeaponTrait;
}

export class ActionsPF2e {
    static exposeActions(actions: { [key: string]: Function }) {
        // basic
        actions.seek = seek;
        actions.senseMotive = senseMotive;

        // acrobatics
        actions.balance = balance;
        actions.maneuverInFlight = maneuverInFlight;
        actions.squeeze = squeeze;
        actions.tumbleThrough = tumbleThrough;

        // athletics
        actions.climb = climb;
        actions.disarm = disarm;
        actions.forceOpen = forceOpen;
        actions.grapple = grapple;
        actions.highJump = highJump;
        actions.longJump = longJump;
        actions.shove = shove;
        actions.swim = swim;
        actions.trip = trip;
        actions.whirlingThrow = whirlingThrow;

        // crafting
        actions.craft = craft;

        // deception
        actions.createADiversion = createADiversion;
        actions.feint = feint;
        actions.impersonate = impersonate;
        actions.lie = lie;

        // diplomacy
        actions.bonMot = bonMot;
        actions.gatherInformation = gatherInformation;
        actions.makeAnImpression = makeAnImpression;
        actions.request = request;

        // intimidation
        actions.coerce = coerce;
        actions.demoralize = demoralize;

        // stealth
        actions.hide = hide;
        actions.sneak = sneak;

        // thievery
        actions.pickALock = pickALock;
    }

    static resolveStat(stat: string): {
        checkType: CheckType;
        property: string;
        stat: string;
        subtitle: string;
    } {
        switch (stat) {
            case "perception":
                return {
                    checkType: "perception-check",
                    property: "data.data.attributes.perception",
                    stat,
                    subtitle: "PF2E.ActionsCheck.perception",
                };
            default:
                return {
                    checkType: "skill-check",
                    property: `data.data.skills.${SKILL_EXPANDED[stat]?.shortform ?? stat}`,
                    stat,
                    subtitle: `PF2E.ActionsCheck.${stat}`,
                };
        }
    }

    static note(
        selector: string,
        translationPrefix: string,
        outcome: DegreeOfSuccessString,
        translationKey?: string
    ): RollNotePF2e {
        const visibility = game.settings.get("pf2e", "metagame.showResults");
        const translated = game.i18n.localize(translationKey ?? `${translationPrefix}.Notes.${outcome}`);
        return new RollNotePF2e(
            selector,
            `<p class="compact-text">${translated}</p>`,
            new PredicatePF2e(),
            visibility === "all" ? [outcome] : []
        );
    }

    static async simpleRollActionCheck(options: SimpleRollActionCheckOptions) {
        // figure out actors to roll for
        const rollers: ActorPF2e[] = [];
        if (Array.isArray(options.actors)) {
            rollers.push(...options.actors);
        } else if (options.actors) {
            rollers.push(options.actors);
        } else if (canvas.tokens.controlled.length) {
            rollers.push(...(canvas.tokens.controlled.map((token) => token.actor) as ActorPF2e[]));
        } else if (game.user.character) {
            rollers.push(game.user.character);
        }

        const targets = Array.from(game.user.targets).filter((t) => t.actor instanceof CreaturePF2e);
        const target = targets.shift()?.document ?? null;
        const targetActor = target?.actor ?? null;

        if (rollers.length) {
            rollers.forEach((actor) => {
                let flavor = "";
                if (options.actionGlyph) {
                    flavor += `<span class="pf2-icon">${options.actionGlyph}</span> `;
                }
                flavor += `<b>${game.i18n.localize(options.title)}</b>`;
                flavor += ` <p class="compact-text">(${game.i18n.localize(options.subtitle)})</p>`;
                const stat = getProperty(actor, options.statName) as StatisticModifier;
                const check = new CheckModifier(flavor, stat, options.modifiers ?? []);

                const targetOptions = targetActor?.getSelfRollOptions("target") ?? [];
                const finalOptions = [
                    actor.getRollOptions(options.rollOptions),
                    options.extraOptions,
                    options.traits,
                    targetOptions,
                ].flat();

                // modifier from roller's equipped weapon
                const weapon = (
                    options.weaponTrait ? this.getApplicableEquippedWeapons(actor, options.weaponTrait) : []
                ).shift();
                if (weapon) {
                    check.push(this.getWeaponPotencyModifier(weapon, actor));
                }

                const weaponTraits = weapon?.traits;

                // Modifier from roller's equipped weapon with -2 ranged penalty
                if (options.weaponTraitWithPenalty === "ranged-trip" && weaponTraits?.has("ranged-trip")) {
                    check.push(
                        new ModifierPF2e({
                            type: MODIFIER_TYPE.CIRCUMSTANCE,
                            slug: "ranged-trip",
                            label: CONFIG.PF2E.weaponTraits["ranged-trip"],
                            modifier: -2,
                        })
                    );
                }

                ensureProficiencyOption(finalOptions, stat.rank ?? -1);
                const dc = ((): CheckDC | null => {
                    if (options.difficultyClass) {
                        return options.difficultyClass;
                    } else if (target && target.actor instanceof CreaturePF2e) {
                        // try to resolve target's defense stat and calculate DC
                        const dcStat = options.difficultyClassStatistic?.(target.actor);
                        if (dcStat) {
                            const extraRollOptions = finalOptions.concat(targetOptions);
                            const dc = dcStat.dc({ extraRollOptions });
                            const dcData: CheckDC = {
                                value: dc.value,
                                adjustments: stat.adjustments ?? [],
                            };
                            if (setHasElement(DC_SLUGS, dcStat.slug)) dcData.slug = dcStat.slug;

                            return dcData;
                        }
                    }
                    return null;
                })();
                const actionTraits: Record<string, string | undefined> = CONFIG.PF2E.featTraits;
                const traitObjects = options.traits.map((trait) => ({
                    name: trait,
                    label: actionTraits[trait] ?? trait,
                }));

                const selfToken = actor.getActiveTokens(false, true).shift();
                const distance = ((): number | null => {
                    const reach =
                        actor instanceof CreaturePF2e ? actor.getReach({ action: "attack", weapon }) ?? null : null;
                    return selfToken?.object && target?.object
                        ? selfToken.object.distanceTo(target.object, { reach })
                        : null;
                })();
                const hasTarget = !!(targetActor && target) && typeof distance === "number";
                const notes = [stat.notes ?? [], options.extraNotes?.(options.statName) ?? []].flat();

                CheckPF2e.roll(
                    check,
                    {
                        actor,
                        token: selfToken,
                        createMessage: options.createMessage,
                        target: hasTarget ? { actor: targetActor, token: target, dc, distance } : null,
                        dc,
                        type: options.checkType,
                        options: finalOptions,
                        notes,
                        traits: traitObjects,
                        title: `${game.i18n.localize(options.title)} - ${game.i18n.localize(options.subtitle)}`,
                    },
                    options.event,
                    (roll, outcome, message) => {
                        options.callback?.({ actor, message, outcome, roll });
                    }
                );
            });
        } else {
            ui.notifications.warn(game.i18n.localize("PF2E.ActionsWarning.NoActor"));
        }
    }

    private static getWeaponPotencyModifier(item: WeaponPF2e, actor: ActorPF2e): ModifierPF2e {
        if (game.settings.get("pf2e", "automaticBonusVariant") !== "noABP") {
            return new ModifierPF2e(
                item.data.name,
                actor.synthetics.weaponPotency["mundane-attack"]?.[0]?.bonus ?? 0,
                MODIFIER_TYPE.POTENCY
            );
        } else {
            return new ModifierPF2e(item.data.name, Number(item.data.data.potencyRune.value), MODIFIER_TYPE.ITEM);
        }
    }

    private static getApplicableEquippedWeapons(actor: ActorPF2e, trait: WeaponTrait): WeaponPF2e[] {
        return actor.itemTypes.weapon.filter((w) => w.isEquipped && w.traits.has(trait));
    }
}
