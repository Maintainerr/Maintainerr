import { Injectable } from '@nestjs/common';
import { Property, RuleConstants, RuleType } from './rules.constants';

/**
 * Derive a friendly "why is this null" explanation entirely from the
 * property's existing metadata (type, humanName, name). No static tables:
 * anything added to RuleConstants automatically gets a sensible reason.
 *
 * The humanName is already authored in a human-readable form like
 * "Last view date" or "[list] Collections media is present in (titles)",
 * so we can reuse it as the noun and wrap it with a verb that matches the
 * field's type. The `[list]` / `[time]` prefixes are stripped so the
 * sentence reads naturally.
 */
const buildDynamicNullReason = (
  property: Property,
  applicationName?: string,
): string => {
  const cleanHuman = stripHumanNamePrefix(property.humanName);
  const noun = cleanHuman || property.name;
  const label = applicationName ? `${applicationName} ${noun}` : noun;

  switch (property.type) {
    case RuleType.DATE:
      return `${label} is not recorded for this item`;
    case RuleType.NUMBER:
      return `${label} is not available for this item`;
    case RuleType.BOOL:
      return `${label} is not available for this item`;
    case RuleType.TEXT:
      return `${label} is not set for this item`;
    case RuleType.TEXT_LIST:
      return `${label} has no entries for this item`;
    default:
      return `${label} is not available for this item`;
  }
};

const stripHumanNamePrefix = (humanName?: string): string => {
  if (!humanName) return '';
  // Strip leading "[list]", "[time]", etc. prefixes used in the UI.
  const trimmed = humanName.trim();
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    if (close !== -1) return trimmed.slice(close + 1).trim();
  }
  return trimmed;
};

export interface ICustomIdentifier {
  type: string;
  value: string | number;
}

@Injectable()
export class RuleConstanstService {
  ruleConstants: RuleConstants;

  constructor() {
    this.ruleConstants = new RuleConstants();
  }

  public getRuleConstants() {
    return this.ruleConstants;
  }

  public getValueIdentifier(location: [number, number]) {
    const application = this.ruleConstants.applications.find(
      (el) => el.id === location[0],
    )?.name;

    const rule = this.ruleConstants.applications
      .find((el) => el.id === location[0])
      ?.props.find((el) => el.id === location[1])?.name;

    return application + '.' + rule;
  }

  public getValueHumanName(location: [number, number]) {
    return `${
      this.ruleConstants.applications.find((el) => el.id === location[0])?.name
    } - ${
      this.ruleConstants.applications
        .find((el) => el.id === location[0])
        ?.props.find((el) => el.id === location[1])?.humanName
    }`;
  }

  /**
   * Translate a (null) rule value into a human-readable explanation of why
   * it was missing. Surfaces in the Test Media YAML output so users stop
   * seeing bare "null" values and can tell the field has no data for this
   * item. Derived dynamically from the property's existing metadata — no
   * static table to maintain. Rules comparisons still fail closed; this is
   * purely diagnostic.
   */
  public getValueNullReason(location: [number, number]): string {
    const application = this.ruleConstants.applications.find(
      (el) => el.id === location[0],
    );
    const prop = application?.props.find((el) => el.id === location[1]);
    if (!prop) return 'Value unavailable';
    return buildDynamicNullReason(prop, application?.name);
  }

  public getValueFromIdentifier(identifier: string): [number, number] {
    const application = identifier.split('.')[0];
    const rule = identifier.split('.')[1];

    const applicationConstant = this.ruleConstants.applications.find(
      (el) => el.name.toLowerCase() === application.toLowerCase(),
    );

    const ruleConstant = applicationConstant.props.find(
      (el) => el.name.toLowerCase() === rule.toLowerCase(),
    );
    return [applicationConstant.id, ruleConstant.id];
  }

  public getCustomValueIdentifier(customValue: {
    ruleTypeId: number;
    value: string;
  }): ICustomIdentifier {
    let ruleType: RuleType;
    let value: string | number;
    switch (customValue.ruleTypeId) {
      case 0:
        if (+customValue.value % 86400 === 0 && +customValue.value != 0) {
          // when it's custom_days, translate to custom_days
          ruleType = new RuleType('4', [], 'custom_days');
          value = (+customValue.value / 86400).toString();
        } else {
          // otherwise, it's a normal number
          ruleType = RuleType.NUMBER;
          value = +customValue.value;
        }
        break;
      case 1:
        ruleType = RuleType.DATE;
        value = customValue.value;
        break;
      case 2:
        ruleType = RuleType.TEXT;
        value = customValue.value;
        break;
      case 3:
        ruleType = RuleType.BOOL;
        value = customValue.value == '1' ? 'true' : 'false';
        break;
      case 4:
        ruleType = RuleType.TEXT_LIST;
        value = customValue.value;
        break;
    }

    return { type: ruleType.humanName, value: value };
  }

  public getCustomValueFromIdentifier(identifier: ICustomIdentifier): {
    ruleTypeId: number;
    value: string;
  } {
    let ruleType: RuleType;
    let value: string;

    switch (identifier.type.toUpperCase()) {
      case 'NUMBER':
        ruleType = RuleType.NUMBER;
        value = identifier.value.toString();
        break;
      case 'DATE':
        ruleType = RuleType.DATE;
        value = identifier.value.toString();
        break;
      case 'TEXT':
        ruleType = RuleType.TEXT;
        value = identifier.value.toString();
        break;
      case 'TEXT_LIST':
        ruleType = RuleType.TEXT_LIST;
        value = identifier.value.toString();
        break;
      case 'BOOLEAN':
        ruleType = RuleType.BOOL;
        value = identifier.value == 'true' ? '1' : '0';
        break;
      case 'BOOL':
        ruleType = RuleType.BOOL;
        value = identifier.value == 'true' ? '1' : '0';
        break;
      case 'CUSTOM_DAYS':
        ruleType = RuleType.NUMBER;
        value = (+identifier.value * 86400).toString();
    }

    return {
      ruleTypeId: +ruleType.toString(), // tostring returns the key
      value: value,
    };
  }
}
