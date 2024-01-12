import { Injectable, Logger } from '@nestjs/common';
import { RuleDto } from '../dtos/rule.dto';
import { ReturnStatus } from '../rules.service';
import {
  RuleConstants,
  RuleOperators,
  RulePossibility,
  RuleType,
} from '../constants/rules.constants';
import YAML from 'yaml';
import {
  EPlexDataType,
  PlexDataTypeStrings,
} from '../../..//modules/api/plex-api/enums/plex-data-type-enum';

interface IRuleYamlParent {
  mediaType: string;
  rules: ISectionYaml[];
}

interface ISectionYaml {
  [key: number]: IRuleYaml[];
}

interface ICustomYamlValue {
  type: string;
  value: string | number;
}

interface IRuleYaml {
  operator?: string;
  action: string;
  firstValue: string;
  lastValue?: string;
  customValue?: ICustomYamlValue;
}

@Injectable()
export class RuleYamlService {
  private readonly logger = new Logger(RuleYamlService.name);

  ruleConstants: RuleConstants;
  constructor() {
    this.ruleConstants = new RuleConstants();
  }
  public encode(rules: RuleDto[], mediaType: number): ReturnStatus {
    try {
      let workingSection = { id: 0, rules: [] };
      const sections: ISectionYaml[] = [];

      for (const rule of rules) {
        if (rule.section !== workingSection.id) {
          // push section and prepare next section
          sections.push({
            [+workingSection.id]: workingSection.rules,
          });
          workingSection = { id: rule.section, rules: [] };
        }

        // transform rule and add to workingSection
        workingSection.rules.push({
          ...(rule.operator ? { operator: RuleOperators[+rule.operator] } : {}),
          firstValue: this.getValueIdentifier(rule.firstVal),
          action: RulePossibility[+rule.action],
          ...(rule.lastVal
            ? { lastValue: this.getValueIdentifier(rule.lastVal) }
            : {}),
          ...(rule.customVal
            ? { customValue: this.getCustomValueIdentifier(rule.customVal) }
            : {}),
        });
      }

      // push last workingsection to sections
      sections.push({ [+workingSection.id]: workingSection.rules });
      const fullObject: IRuleYamlParent = {
        mediaType: PlexDataTypeStrings[+mediaType - 1],
        rules: sections,
      };
      // Transform to yaml
      const yaml = YAML.stringify(fullObject);

      return {
        code: 1,
        result: yaml,
        message: 'success',
      };
    } catch (e) {
      this.logger.warn(`Yaml export failed : ${e.message}`);
      this.logger.debug(e);
      return {
        code: 0,
        message: 'Yaml export failed. Please check logs',
      };
    }
  }

  public decode(yaml: string, mediaType: number): ReturnStatus {
    try {
      const decoded: IRuleYamlParent = YAML.parse(yaml);
      const rules: RuleDto[] = [];
      let idRef = 0;

      // Break when media types are incompatible
      if (+mediaType !== +EPlexDataType[decoded.mediaType.toUpperCase()]) {
        this.logger.warn(`Yaml import failed. Incompatible media types`);
        this.logger.debug(
          `media type with ID ${+mediaType} is not compatible with media type with ID ${
            EPlexDataType[decoded.mediaType.toUpperCase()]
          } `,
        );

        return {
          code: 0,
          message: 'Yaml import failed. Incompatible media types',
        };
      }

      for (const section of decoded.rules) {
        for (const rule of section[idRef]) {
          rules.push({
            operator: rule.operator
              ? +RuleOperators[rule.operator.toUpperCase()]
              : null,
            action: +RulePossibility[rule.action.toUpperCase()],
            section: idRef,
            firstVal: this.getValueFromIdentifier(
              rule.firstValue.toLowerCase(),
            ),
            ...(rule.lastValue
              ? {
                  lastVal: this.getValueFromIdentifier(
                    rule.lastValue.toLowerCase(),
                  ),
                }
              : {}),
            ...(rule.customValue
              ? {
                  customVal: this.getCustomValueFromIdentifier(
                    rule.customValue,
                  ),
                }
              : {}),
          });
        }
        idRef++;
      }

      const returnObj: { mediaType: number; rules: RuleDto[] } = {
        mediaType: EPlexDataType[decoded.mediaType],
        rules: rules,
      };

      return {
        code: 1,
        result: JSON.stringify(returnObj),
        message: 'success',
      };
    } catch (e) {
      this.logger.warn(`Yaml import failed. Is the yaml valid?`);
      this.logger.debug(e);
      return {
        code: 0,
        message: 'Import failed, please check your yaml',
      };
    }
  }
  private getValueIdentifier(location: [number, number]) {
    const application = this.ruleConstants.applications[location[0]].name;
    const rule =
      this.ruleConstants.applications[location[0]].props[location[1]].name;

    return application + '.' + rule;
  }

  private getValueFromIdentifier(identifier: string): [number, number] {
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

  private getCustomValueIdentifier(customValue: {
    ruleTypeId: number;
    value: string;
  }): ICustomYamlValue {
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
    }

    return { type: ruleType.humanName, value: value };
  }

  private getCustomValueFromIdentifier(identifier: ICustomYamlValue): {
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
