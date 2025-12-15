import { Injectable } from '@nestjs/common';
import { RuleConstants, RuleType } from './rules.constants';

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
