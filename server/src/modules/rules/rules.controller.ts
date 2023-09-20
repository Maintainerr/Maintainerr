import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommunityRule } from './dtos/communityRule.dto';
import { ExclusionDto } from './dtos/exclusion.dto';
import { RulesDto } from './dtos/rules.dto';
import { RuleExecutorService } from './rule-executor.service';
import { ReturnStatus, RulesService } from './rules.service';

@Controller('api/rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly ruleExecutorService: RuleExecutorService,
  ) {}
  @Get('/constants')
  async getRuleConstants() {
    return await this.rulesService.getRuleConstants();
  }

  @Get('/community')
  async getCommunityRules() {
    return await this.rulesService.getCommunityRules();
  }

  @Get('/community/karma/history')
  async getCommunityRuleKarmaHistory() {
    return await this.rulesService.getCommunityRuleKarmaHistory();
  }

  @Get('/exclusion')
  getExclusion(@Query() query: { rulegroupId?: number; plexId?: number }) {
    return this.rulesService.getExclusions(query.rulegroupId, query.plexId);
  }
  @Get('/:id')
  getRules(@Param('id') id: string) {
    return this.rulesService.getRules(id);
  }

  @Get()
  getRuleGroups(
    @Query()
    query: {
      activeOnly?: boolean;
      libraryId?: number;
      typeId?: number;
    },
  ) {
    return this.rulesService.getRuleGroups(
      query.activeOnly !== undefined ? query.activeOnly : false,
      query.libraryId ? query.libraryId : undefined,
      query.typeId ? query.typeId : undefined,
    );
  }
  @Delete('/:id')
  deleteRuleGroup(@Param('id') id: string) {
    return this.rulesService.deleteRuleGroup(+id);
  }
  @Post('/execute')
  executeRules() {
    this.ruleExecutorService.executeAllRules();
  }
  @Post()
  async setRules(@Body() body: RulesDto): Promise<ReturnStatus> {
    return await this.rulesService.setRules(body);
  }
  @Post('/exclusion')
  async setExclusion(@Body() body: ExclusionDto): Promise<ReturnStatus> {
    return await this.rulesService.setExclusion(body);
  }
  @Delete('/exclusion/:id')
  async removeExclusion(@Param('id') id: string): Promise<ReturnStatus> {
    return await this.rulesService.removeExclusion(+id);
  }
  @Delete('/exclusions/:plexId')
  async removeAllExclusion(
    @Param('plexId') plexId: string,
  ): Promise<ReturnStatus> {
    return await this.rulesService.removeAllExclusion(+plexId);
  }
  @Put()
  async updateRule(@Body() body: RulesDto): Promise<ReturnStatus> {
    this.rulesService.deleteRuleGroup(body.id);
    return await this.rulesService.setRules(body);
  }
  @Post()
  async updateJob(@Body() body: { cron: string }): Promise<ReturnStatus> {
    return await this.ruleExecutorService.updateJob(body.cron);
  }
  @Post('/community')
  async updateCommunityRules(
    @Body() body: CommunityRule,
  ): Promise<ReturnStatus> {
    if (body.name && body.description && body.JsonRules) {
      return await this.rulesService.addToCommunityRules(body);
    } else {
      return {
        code: 0,
        result: 'Invalid input',
      };
    }
  }
  @Post('/community/karma')
  async updateCommunityRuleKarma(
    @Body() body: { id: number; karma: number },
  ): Promise<ReturnStatus> {
    if (body.id !== undefined && body.karma !== undefined) {
      return await this.rulesService.updateCommunityRuleKarma(
        body.id,
        body.karma,
      );
    } else {
      return {
        code: 0,
        result: 'Invalid input',
      };
    }
  }
}
