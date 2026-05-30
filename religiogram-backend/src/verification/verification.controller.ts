import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Request } from 'express';
import { VerificationService } from './verification.service';
import {
  AddDocumentDto,
  RejectSubmissionDto,
  MoreInfoDto,
} from './dto/verification.dto';

@ApiTags('verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'verification', version: '1' })
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('submission')
  @HttpCode(HttpStatus.CREATED)
  @Roles('advisor')
  @ApiOperation({ summary: 'Create a new verification submission (provider)' })
  createSubmission(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.createSubmission(user.id);
  }

  @Post('submission/:id/document')
  @HttpCode(HttpStatus.CREATED)
  @Roles('advisor')
  @ApiOperation({ summary: 'Add a document to a submission (provider)' })
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddDocumentDto,
  ) {
    return this.verificationService.addDocument(
      id,
      user.id,
      dto.type,
      dto.s3Key,
      dto.s3Bucket,
      dto.contentHash,
    );
  }

  @Post('submission/:id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('advisor')
  @ApiOperation({ summary: 'Submit a verification submission for review (provider)' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.verificationService.submit(id, user.id);
  }

  @Get('my')
  @Roles('advisor')
  @ApiOperation({ summary: 'Get all submissions for the calling provider' })
  getMySubmissions(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.getByProvider(user.id);
  }

  @Get('admin/queue')
  @Roles('admin')
  @ApiOperation({ summary: 'Get pending verification queue (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPendingQueue(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.verificationService.getPendingQueue(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a verification submission by ID (provider or admin)' })
  async getSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const submission = await this.verificationService.getSubmission(id);
    if (!submission) throw new NotFoundException();
    // Only the owning provider or admin can view
    if (req.user.role !== 'admin' && submission.providerId !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }
    return submission;
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Approve a verification submission (admin)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.verificationService.approve(id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Reject a verification submission (admin)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectSubmissionDto,
  ) {
    return this.verificationService.reject(id, user.id, dto.reason);
  }

  @Post(':id/more-info')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Request more info for a verification submission (admin)' })
  requestMoreInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MoreInfoDto,
  ) {
    return this.verificationService.requestMoreInfo(id, user.id, dto.note);
  }
}
