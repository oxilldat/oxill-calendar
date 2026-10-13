import type { Moment, MomentFormatSpecification, MomentInput } from "moment";
import { moment as obsidianMoment } from "obsidian";

type MomentFactory = (
  input?: MomentInput,
  format?: MomentFormatSpecification,
  strict?: boolean
) => Moment;

const factory = obsidianMoment as unknown as MomentFactory;

export const moment: MomentFactory = (...args) => Reflect.apply(factory, undefined, args);
