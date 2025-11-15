import { Injectable } from '@nestjs/common';
import YAML from 'yaml';
import {
  EPlexDataType,
  PlexDataTypeStrings,
} from '../../..//modules/api/plex-api/enums/plex-data-type-enum';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  ICustomIdentifier,
  RuleConstanstService,
} from '../constants/constants.service';
import { RuleOperators, RulePossibility } from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { ReturnStatus } from '../rules.service';

interface IRuleYamlParent {
  mediaType: string;
  rules: ISectionYaml[];
}

interface ISectionYaml {
  [key: number]: IRuleYaml[];
}

interface IRuleYaml {
  operator?: string;
  action: string;
  firstValue: string;
  lastValue?: string;
  customValue?: ICustomIdentifier;
}

@Injectable()
export class RuleYamlService {
  constructor(
    private readonly ruleConstanstService: RuleConstanstService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleYamlService.name);
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
          firstValue: this.ruleConstanstService.getValueIdentifier(
            rule.firstVal,
          ),
          action: RulePossibility[+rule.action],
          ...(rule.lastVal
            ? {
                lastValue: this.ruleConstanstService.getValueIdentifier(
                  rule.lastVal,
                ),
              }
            : {}),
          ...(rule.customVal
            ? {
                customValue: this.ruleConstanstService.getCustomValueIdentifier(
                  rule.customVal,
                ),
              }
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
          `Media type with ID ${+mediaType} is not compatible with media type with ID ${
            EPlexDataType[decoded.mediaType.toUpperCase()]
          } `,
        );

        return {
          code: 0,
          message: 'Yaml import failed. Incompatible media types.',
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
            firstVal: this.ruleConstanstService.getValueFromIdentifier(
              rule.firstValue.toLowerCase(),
            ),
            ...(rule.lastValue
              ? {
                  lastVal: this.ruleConstanstService.getValueFromIdentifier(
                    rule.lastValue.toLowerCase(),
                  ),
                }
              : {}),
            ...(rule.customValue
              ? {
                  customVal:
                    this.ruleConstanstService.getCustomValueFromIdentifier(
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
}
