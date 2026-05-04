import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SavedModule } from '../saved/saved.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [DatabaseModule, SavedModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
