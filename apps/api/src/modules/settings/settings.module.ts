import { Global, Module } from '@nestjs/common';
import { AdminSettingsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AdminThemeController, ThemeController } from './theme.controller';
import { ThemeService } from './theme.service';

@Global()
@Module({
  controllers: [SettingsController, AdminSettingsController, ThemeController, AdminThemeController],
  providers: [SettingsService, ThemeService],
  exports: [SettingsService, ThemeService],
})
export class SettingsModule {}
