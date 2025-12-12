import { RuleExecuteStatusDto } from '@maintainerr/contracts';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
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
import { RuleExecutorJobManagerService } from './tasks/rule-executor-job-manager.service';
import { RuleExecutorSchedulerService } from './tasks/rule-executor-scheduler.service';

@Controller('api/rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly ruleExecutorSchedulerService: RuleExecutorSchedulerService,
    private readonly ruleExecutorJobManagerService: RuleExecutorJobManagerService,
  ) {}

  @Get('/constants')
  async getRuleConstants() {
    return await this.rulesService.getRuleConstants();
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

  @Get('/count')
  async getRuleGroupCount() {
    return this.rulesService.getRuleGroupCount();
  }

  @Get('/:id/rules')
  getRules(@Param('id', ParseIntPipe) id: number) {
    return this.rulesService.getRules(id);
  }

  @Get('/collection/:id')
  getRuleGroupByCollectionId(@Param('id', ParseIntPipe) id: number) {
    return this.rulesService.getRuleGroupByCollectionId(id);
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
  getRuleGroup(@Param('id', ParseIntPipe) id: number): Promise<RulesDto> {
    return this.rulesService.getRuleGroup(id);
  }

  @Delete('/:id')
  deleteRuleGroup(@Param('id', ParseIntPipe) id: number) {
    return this.rulesService.deleteRuleGroup(id);
  }

  @Post('/execute')
  async executeRules() {
    if (this.ruleExecutorJobManagerService.isProcessing()) {
      throw new HttpException(
        'The rule executor is already running',
        HttpStatus.CONFLICT,
      );
    }

    this.ruleExecutorSchedulerService
      .enqueueAllActiveRuleGroups()
      .catch((e) => console.error(e));
  }

  @Post('/:id/execute')
  async executeRule(@Param('id', ParseIntPipe) id: number) {
    const ruleGroup = await this.rulesService.getRuleGroup(id);
    if (!ruleGroup) {
      throw new NotFoundException('Rule group not found');
    }

    if (!ruleGroup.isActive) {
      throw new ConflictException('Rule group is not active');
    }

    if (this.ruleExecutorJobManagerService.isRuleGroupProcessingOrQueued(id)) {
      throw new ConflictException(
        'The rule is already being executed or is queued for execution',
      );
    }

    const result = this.ruleExecutorJobManagerService.enqueue({
      ruleGroupId: id,
    });

    if (!result) {
      throw new ConflictException(
        'Failed to enqueue the rule group for execution',
      );
    }
  }

  @Get('/execute/status')
  getExecutionStatus(): RuleExecuteStatusDto {
    const status = this.ruleExecutorJobManagerService.getStatus();
    return status;
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
    if (!this.ruleExecutorJobManagerService.isProcessing()) {
      res.status(HttpStatus.OK).send();
      return;
    }

    this.ruleExecutorJobManagerService
      .stopProcessing()
      .catch((e) => console.error(e));
    res.status(HttpStatus.ACCEPTED).send();
  }

  @Post('/:id/execute/stop')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'The rules handler is already stopped.',
  })
  @ApiResponse({
    status: 202,
    description: 'The rules handler has been requested to stop.',
  })
  async stopExecutingRule(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    if (!this.ruleExecutorJobManagerService.isRuleGroupProcessingOrQueued(id)) {
      res.status(HttpStatus.OK).send();
      return;
    }

    this.ruleExecutorJobManagerService.stopProcessingRuleGroup(id);
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
  async removeExclusion(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ReturnStatus> {
    return await this.rulesService.removeExclusion(id);
  }

  @Delete('/exclusions/:plexId')
  async removeAllExclusion(
    @Param('plexId', ParseIntPipe) plexId: number,
  ): Promise<ReturnStatus> {
    return await this.rulesService.removeAllExclusion(plexId);
  }

  @Put()
  async updateRule(@Body() body: RulesDto): Promise<ReturnStatus> {
    return await this.rulesService.updateRules(body);
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
