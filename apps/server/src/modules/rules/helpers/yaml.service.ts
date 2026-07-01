import {
  MediaDataTypeStrings,
  MediaItemType,
  MediaItemTypes,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import YAML from 'yaml';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  ICustomIdentifier,
  RuleConstanstService,
} from '../constants/constants.service';
import { RuleOperators, RulePossibility } from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { ReturnStatus } from '../rules.service';
import { reassertSectionBoundaryOperators } from './section-operators';

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
  arrDiskPath?: string;
}

@Injectable()
export class RuleYamlService {
  constructor(
    private readonly ruleConstanstService: RuleConstanstService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleYamlService.name);
  }

  public encode(rules: RuleDto[], mediaType: MediaItemType): ReturnStatus {
    try {
      let workingSection = { id: 0, rules: [] };
      const sections: ISectionYaml[] = [];
      let skipped = 0;

      for (const rule of rules) {
        if (rule.section !== workingSection.id) {
          // push section and prepare next section
          sections.push({
            [+workingSection.id]: workingSection.rules,
          });
          workingSection = { id: rule.section, rules: [] };
        }

        const firstValue = this.ruleConstanstService.getValueIdentifier(
          rule.firstVal,
        );
        const lastValue = rule.lastVal
          ? this.ruleConstanstService.getValueIdentifier(rule.lastVal)
          : undefined;

        // Skip an unresolved property rather than emit `App.undefined`, which
        // produces YAML that cannot be decoded again. The section boundary was
        // already advanced, so section keys stay aligned with the kept rules.
        if (firstValue == null || (rule.lastVal != null && lastValue == null)) {
          skipped += 1;
          this.logger.warn(
            `Skipping rule on YAML export: unresolved property identifier ` +
              `(firstVal=${JSON.stringify(rule.firstVal)}` +
              `${rule.lastVal != null ? `, lastVal=${JSON.stringify(rule.lastVal)}` : ''})`,
          );
          continue;
        }

        // transform rule and add to workingSection
        workingSection.rules.push({
          // Use a null check, not a truthy check: the AND operator is 0, which
          // is falsy, so `rule.operator ?` would silently drop an AND section
          // operator (stored numerically by YAML imports) on export.
          ...(rule.operator != null
            ? { operator: RuleOperators[+rule.operator] }
            : {}),
          firstValue,
          action: RulePossibility[+rule.action],
          ...(lastValue != null
            ? {
                lastValue,
              }
            : {}),
          ...(rule.customVal
            ? {
                customValue: this.ruleConstanstService.getCustomValueIdentifier(
                  rule.customVal,
                ),
              }
            : {}),
          ...(rule.arrDiskPath
            ? {
                arrDiskPath: rule.arrDiskPath,
              }
            : {}),
        });
      }

      // push last workingsection to sections
      sections.push({ [+workingSection.id]: workingSection.rules });
      // Convert MediaItemType to uppercase string for YAML serialization
      const mediaTypeIndex = MediaItemTypes.indexOf(mediaType);
      const fullObject: IRuleYamlParent = {
        mediaType:
          mediaTypeIndex >= 0
            ? MediaDataTypeStrings[mediaTypeIndex]
            : MediaDataTypeStrings[0],
        rules: sections,
      };
      // Transform to yaml
      const yaml = YAML.stringify(fullObject);

      return {
        code: 1,
        result: yaml,
        message: 'success',
        skipped,
      };
    } catch (error) {
      this.logger.warn('Yaml export failed');
      this.logger.debug(error);
      return {
        code: 0,
        message: 'Yaml export failed. Please check logs',
      };
    }
  }

  public decode(yaml: string, mediaType: MediaItemType): ReturnStatus {
    try {
      const decoded: IRuleYamlParent = YAML.parse(yaml);
      const rules: RuleDto[] = [];
      let skipped = 0;
      let idRef = 0;

      // Convert YAML uppercase string to MediaItemType
      const yamlMediaTypeIndex = MediaDataTypeStrings.indexOf(
        decoded.mediaType.toUpperCase(),
      );
      const yamlMediaType: MediaItemType | undefined =
        yamlMediaTypeIndex >= 0
          ? MediaItemTypes[yamlMediaTypeIndex]
          : undefined;

      // Break when media types are incompatible
      if (!yamlMediaType || mediaType !== yamlMediaType) {
        this.logger.warn(`Yaml import failed. Incompatible media types`);
        this.logger.debug(
          `Media type '${mediaType}' is not compatible with YAML media type '${decoded.mediaType}'`,
        );

        return {
          code: 0,
          message: 'Yaml import failed. Incompatible media types.',
        };
      }

      // Capture each section's original combine operator (its first YAML rule's
      // operator) before any rule is skipped, so a dropped boundary doesn't let
      // the next rule's within-section operator silently become the boundary.
      const sectionCombineOp = new Map<number, RuleDto['operator']>();
      decoded.rules.forEach((section, sectionIndex) => {
        const firstRule = section[sectionIndex]?.[0];
        sectionCombineOp.set(
          sectionIndex,
          firstRule?.operator
            ? +RuleOperators[firstRule.operator.toUpperCase()]
            : null,
        );
      });

      for (const section of decoded.rules) {
        for (const rule of section[idRef]) {
          const firstVal = this.ruleConstanstService.getValueFromIdentifier(
            rule.firstValue.toLowerCase(),
          );
          const lastVal = rule.lastValue
            ? this.ruleConstanstService.getValueFromIdentifier(
                rule.lastValue.toLowerCase(),
              )
            : undefined;

          // Skip an unresolved rule rather than reject the whole document.
          if (firstVal == null || (rule.lastValue && lastVal == null)) {
            skipped += 1;
            this.logger.warn(
              `Skipping rule on YAML import: unresolved identifier ` +
                `'${rule.firstValue}'${rule.lastValue ? `/'${rule.lastValue}'` : ''}`,
            );
            continue;
          }

          rules.push({
            // Within-section default is OR; section boundaries are re-asserted
            // from the captured combine operators after the loop.
            operator: rule.operator
              ? +RuleOperators[rule.operator.toUpperCase()]
              : rules.length === 0
                ? null
                : RuleOperators.OR,
            action: +RulePossibility[rule.action.toUpperCase()],
            section: idRef,
            firstVal,
            ...(lastVal != null
              ? {
                  lastVal,
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
            ...(rule.arrDiskPath
              ? {
                  arrDiskPath: rule.arrDiskPath,
                }
              : {}),
          });
        }
        idRef++;
      }

      // Carry each section's original combine operator onto its first surviving
      // rule so a dropped boundary can't flip the section AND<->OR.
      reassertSectionBoundaryOperators(rules, sectionCombineOp);

      return {
        code: 1,
        result: JSON.stringify({ mediaType: yamlMediaType, rules }),
        message: 'success',
        skipped,
      };
    } catch (error) {
      this.logger.warn('Yaml import failed. Is the yaml valid?');
      this.logger.debug(error);
      return {
        code: 0,
        message: 'Validation failed - Please check your YAML structure.',
      };
    }
  }
}
