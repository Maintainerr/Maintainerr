import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { CommunityRule } from './dtos/communityRule.dto';
import { ExclusionAction, ExclusionContextDto } from './dtos/exclusion.dto';
import { RulesDto } from './dtos/rules.dto';
import { ReturnStatus, RulesService } from './rules.service';
import { RuleExecutorService } from './tasks/rule-executor.service';

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

  @Put('/schedule/update')
  updateSchedule(@Body() request: { schedule: string }) {
    return this.ruleExecutorService.updateJob(request.schedule);
  }

  @Get('/community')
  async getCommunityRules() {
    return await this.rulesService.getCommunityRules();
  }

  @Get('/community/count')
  async getCommunityRuleCount() {
    return this.rulesService.getCommunityRuleCount();
  }

  @Get('/community/karma/history')
  async getCommunityRuleKarmaHistory() {
    return await this.rulesService.getCommunityRuleKarmaHistory();
  }

  @Get('/exclusion')
  getExclusion(@Query() query: { rulegroupId?: number; plexId?: number }) {
    return this.rulesService.getExclusions(query.rulegroupId, query.plexId);
  }

  @Get('/exclusion/all')
  async getAllExcludedItems() {
    const exclusions = await this.rulesService.getAllExclusions();

    // Return array of objects like: { plexId: 12345, type: 3 }
    return exclusions.map((excl) => ({
      plexId: +excl.plexId,
      type: excl.type,
      ruleGroupId: excl.ruleGroupId,
      id: excl.id,
      parent: excl.parent,
    }));
  }

  @Get('/count')
  async getRuleGroupCount() {
    return this.rulesService.getRuleGroupCount();
  }

  @Get('/:id/rules')
  getRules(@Param('id') id: string) {
    return this.rulesService.getRules(id);
  }

  @Get('/collection/:id')
  getRuleGroupByCollectionId(@Param('id') id: string) {
    return this.rulesService.getRuleGroupByCollectionId(+id);
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

  @Get('/:id')
  getRuleGroup(@Param('id') id: number): Promise<RulesDto> {
    return this.rulesService.getRuleGroup(id);
  }

  @Delete('/:id')
  deleteRuleGroup(@Param('id') id: string) {
    return this.rulesService.deleteRuleGroup(+id);
  }
  @Post('/execute')
  async executeRules() {
    if (await this.ruleExecutorService.isRunning()) {
      throw new HttpException(
        'The rule executor is already running',
        HttpStatus.CONFLICT,
      );
    }

    this.ruleExecutorService.execute().catch((e) => console.error(e));
  }

  @Post('/execute/stop')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'The rules handler is already stopped.',
  })
  @ApiResponse({
    status: 202,
    description: 'The rules handler has been requested to stop.',
  })
  async stopExecutingRules(@Res() res: Response) {
    if (!(await this.ruleExecutorService.isRunning())) {
      res.status(HttpStatus.OK).send();
      return;
    }

    this.ruleExecutorService.stopExecution().catch((e) => console.error(e));
    res.status(HttpStatus.ACCEPTED).send();
  }

  @Post()
  async setRules(@Body() body: RulesDto): Promise<ReturnStatus> {
    return await this.rulesService.setRules(body);
  }
  @Post('/exclusion')
  async setExclusion(@Body() body: ExclusionContextDto): Promise<ReturnStatus> {
    if (body.action === undefined || body.action === ExclusionAction.ADD) {
      return await this.rulesService.setExclusion(body);
    } else {
      return await this.rulesService.removeExclusionWitData(body);
    }
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
    return await this.rulesService.updateRules(body);
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

  /**
   * Encodes an array of RuleDto objects to YAML format.
   *
   * @param {RuleDto[]} rules - The array of RuleDto objects to be encoded.
   * @return {Promise<ReturnStatus>} A Promise that resolves to a ReturnStatus object.
   */
  @Post('/yaml/encode')
  async yamlEncode(
    @Body() body: { rules: string; mediaType: number },
  ): Promise<ReturnStatus> {
    try {
      return this.rulesService.encodeToYaml(
        JSON.parse(body.rules),
        body.mediaType,
      );
    } catch (err) {
      return {
        code: 0,
        result: 'Invalid input',
      };
    }
  }

  /**
   * Decodes a YAML-encoded string and returns an array of RuleDto objects.
   *
   * @param {string} body - The YAML-encoded string to decode.
   * @return {Promise<ReturnStatus>} - A Promise that resolves to the decoded ReturnStatus object.
   */
  @Post('/yaml/decode')
  async yamlDecode(
    @Body() body: { yaml: string; mediaType: number },
  ): Promise<ReturnStatus> {
    try {
      return this.rulesService.decodeFromYaml(body.yaml, body.mediaType);
    } catch (err) {
      return {
        code: 0,
        result: 'Invalid input',
      };
    }
  }

  @Post('/test')
  async testRuleGroup(@Body() body: { mediaId: string; rulegroupId: number }) {
    return this.rulesService.testRuleGroupWithData(
      body.rulegroupId,
      body.mediaId,
    );
  }
}
