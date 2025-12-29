# Phase E: UI Integration

**Duration:** ~1-2 weeks  
**Goal:** Add Jellyfin settings UI and adapt existing UI for multi-server support

**Prerequisite:** Phase A-D complete

---

## E.1: UI Structure Overview

```
apps/ui/src/
├── components/
│   └── Settings/
│       ├── MediaServerSettings/     # NEW folder
│       │   ├── index.ts
│       │   ├── MediaServerSelector.tsx
│       │   ├── PlexSettings.tsx     # Existing, refactored
│       │   └── JellyfinSettings.tsx # NEW
│       └── ...
├── pages/
│   └── SettingsPage.tsx             # Update to include server selector
├── api/
│   └── settings.ts                  # Add Jellyfin API calls
└── hooks/
    └── useMediaServerType.ts        # NEW hook
```

---

## E.2: New Hook: useMediaServerType

### `hooks/useMediaServerType.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { getSettings } from '../api/settings';

export type MediaServerType = 'plex' | 'jellyfin';

export function useMediaServerType() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  return {
    mediaServerType: settings?.media_server_type as MediaServerType | undefined,
    isLoading,
    isPlex: settings?.media_server_type === 'plex',
    isJellyfin: settings?.media_server_type === 'jellyfin',
  };
}

// Note: Removed useMediaServerFeatures hook - per maintainer feedback,
// we don't need UI warnings about feature differences. Both servers
// work with the same UI, properties are handled at the rules engine level.
```

---

## E.3: Media Server Selector Component

### `components/Settings/MediaServerSettings/MediaServerSelector.tsx`

```tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RadioGroup } from '@headlessui/react';
import clsx from 'clsx';

const mediaServerSchema = z.object({
  media_server_type: z.enum(['plex', 'jellyfin']),
});

type MediaServerFormData = z.infer<typeof mediaServerSchema>;

interface Props {
  currentType: 'plex' | 'jellyfin';
  onTypeChange: (type: 'plex' | 'jellyfin') => void;
  disabled?: boolean;
}

const serverOptions = [
  {
    value: 'plex',
    name: 'Plex',
    description: 'Plex Media Server',
    icon: '/icons_logos/plex.svg',
  },
  {
    value: 'jellyfin',
    name: 'Jellyfin',
    description: 'Jellyfin Media Server',
    icon: '/icons_logos/jellyfin.svg',
  },
];

export function MediaServerSelector({ currentType, onTypeChange, disabled }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-100">Media Server</h3>
        <p className="text-sm text-gray-400">
          Select your media server type. This will determine available features.
        </p>
      </div>

      <RadioGroup value={currentType} onChange={onTypeChange} disabled={disabled}>
        <RadioGroup.Label className="sr-only">Media Server Type</RadioGroup.Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {serverOptions.map((option) => (
            <RadioGroup.Option
              key={option.value}
              value={option.value}
              className={({ active, checked }) =>
                clsx(
                  'relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none',
                  active ? 'ring-2 ring-indigo-500' : '',
                  checked
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600',
                  disabled && 'cursor-not-allowed opacity-50'
                )
              }
            >
              {({ checked }) => (
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <img
                      src={option.icon}
                      alt={option.name}
                      className="h-10 w-10 rounded"
                    />
                    <div className="ml-4">
                      <RadioGroup.Label
                        as="p"
                        className="font-medium text-gray-100"
                      >
                        {option.name}
                      </RadioGroup.Label>
                      <RadioGroup.Description
                        as="span"
                        className="text-sm text-gray-400"
                      >
                        {option.description}
                      </RadioGroup.Description>
                    </div>
                  </div>
                  {checked && (
                    <div className="shrink-0 text-indigo-500">
                      <CheckCircleIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>

      {disabled && (
        <p className="text-sm text-amber-400">
          ⚠️ Changing media server type requires reconfiguring your collections.
        </p>
      )}
    </div>
  );
}
```

---

## E.4: Jellyfin Settings Component

### `components/Settings/MediaServerSettings/JellyfinSettings.tsx`

```tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '../../Forms/Input';
import { Button } from '../../Common/Button';
import { Alert } from '../../Common/Alert';
import { testJellyfinConnection, saveJellyfinSettings } from '../../../api/settings';

const jellyfinSchema = z.object({
  jellyfin_url: z
    .string()
    .url('Please enter a valid URL')
    .refine((url) => url.startsWith('http'), 'URL must start with http:// or https://'),
  jellyfin_api_key: z.string().min(1, 'API key is required'),
  jellyfin_user_id: z.string().optional(),
});

type JellyfinFormData = z.infer<typeof jellyfinSchema>;

interface Props {
  initialData?: Partial<JellyfinFormData>;
}

export function JellyfinSettings({ initialData }: Props) {
  const queryClient = useQueryClient();
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<JellyfinFormData>({
    resolver: zodResolver(jellyfinSchema),
    defaultValues: initialData,
  });

  const testConnection = useMutation({
    mutationFn: testJellyfinConnection,
    onSuccess: (data) => {
      setTestStatus('success');
      setTestMessage(`Connected to ${data.serverName} (v${data.version})`);
    },
    onError: (error: Error) => {
      setTestStatus('error');
      setTestMessage(error.message || 'Connection failed');
    },
  });

  const saveSettings = useMutation({
    mutationFn: saveJellyfinSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const onSubmit = async (data: JellyfinFormData) => {
    await saveSettings.mutateAsync(data);
  };

  const handleTestConnection = () => {
    const values = getValues();
    testConnection.mutate(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-100">Jellyfin Settings</h3>
        <p className="mt-1 text-sm text-gray-400">
          Configure your Jellyfin server connection.
        </p>
      </div>

      <Alert variant="info" className="mb-4">
        <strong>Getting your API Key:</strong> In Jellyfin, go to Dashboard → API Keys → 
        Create a new API key named "Maintainerr".
      </Alert>

      <Input
        label="Jellyfin URL"
        placeholder="http://jellyfin.local:8096"
        error={errors.jellyfin_url?.message}
        {...register('jellyfin_url')}
      />

      <Input
        label="API Key"
        type="password"
        placeholder="Enter your Jellyfin API key"
        error={errors.jellyfin_api_key?.message}
        {...register('jellyfin_api_key')}
      />

      <Input
        label="Admin User ID (Optional)"
        placeholder="Auto-detected if not specified"
        error={errors.jellyfin_user_id?.message}
        {...register('jellyfin_user_id')}
        helperText="Used for admin operations. Leave blank to auto-detect."
      />

      {testStatus !== 'idle' && (
        <Alert variant={testStatus === 'success' ? 'success' : 'error'}>
          {testMessage}
        </Alert>
      )}

      <div className="flex gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleTestConnection}
          loading={testConnection.isPending}
        >
          Test Connection
        </Button>
        <Button
          type="submit"
          loading={isSubmitting || saveSettings.isPending}
          disabled={testStatus !== 'success'}
        >
          Save Settings
        </Button>
      </div>
    </form>
  );
}
```

---

## E.5: Collection Form Notes

**Per maintainer feedback:** No conditional UI visibility warnings.

The existing CollectionForm keeps its visibility fields (visibleOnHome, visibleOnRecommended).
These fields are Plex-only and will simply be ignored when Jellyfin is the configured server.
The backend handles this gracefully - Jellyfin collections work without visibility settings.

No UI changes needed for CollectionForm.

---

## E.6: Rules Builder Notes

**Per maintainer feedback:** No UI noise about unavailable properties.

The rules builder uses properties based on the `application` field in RuleConstants.
When a user selects a property for `jellyfin` application, the getter service
automatically handles it. Properties that don't apply to Jellyfin (like Plex-specific
watchlist) will naturally not appear when `jellyfin` is selected as the application.

The existing RuleBuilder dropdown already filters by application - no changes needed.

---

## E.7: API Updates

### `api/settings.ts`

```typescript
import axios from 'axios';

export interface JellyfinSettings {
  jellyfin_url: string;
  jellyfin_api_key: string;
  jellyfin_user_id?: string;
}

export interface JellyfinTestResult {
  serverName: string;
  version: string;
  operatingSystem: string;
}

export async function testJellyfinConnection(
  settings: JellyfinSettings
): Promise<JellyfinTestResult> {
  const response = await axios.post<JellyfinTestResult>(
    '/api/settings/jellyfin/test',
    settings
  );
  return response.data;
}

export async function saveJellyfinSettings(
  settings: JellyfinSettings
): Promise<void> {
  await axios.post('/api/settings/jellyfin', settings);
}

export async function getMediaServerType(): Promise<'plex' | 'jellyfin'> {
  const response = await axios.get<{ media_server_type: 'plex' | 'jellyfin' }>(
    '/api/settings/media-server-type'
  );
  return response.data.media_server_type;
}
```

---

## E.8: Server-Side Settings Controller

### Add Jellyfin endpoints

```typescript
// In settings.controller.ts
@Controller('settings')
export class SettingsController {
  @Post('jellyfin/test')
  async testJellyfinConnection(
    @Body() settings: JellyfinSettingsDto
  ): Promise<JellyfinTestResultDto> {
    return this.settingsService.testJellyfinConnection(settings);
  }

  @Post('jellyfin')
  async saveJellyfinSettings(
    @Body() settings: JellyfinSettingsDto
  ): Promise<void> {
    await this.settingsService.saveJellyfinSettings(settings);
  }

  @Get('media-server-type')
  async getMediaServerType(): Promise<{ media_server_type: string }> {
    const settings = await this.settingsService.getSettings();
    return { media_server_type: settings.media_server_type };
  }
}
```

---

## E.9: Add Jellyfin Logo

Download Jellyfin logo to: `apps/ui/public/icons_logos/jellyfin.svg`

---

## E.10: Testing Requirements

### Component Tests

1. **MediaServerSelector**
   - Test selection change
   - Test disabled state

2. **JellyfinSettings**
   - Test form validation
   - Test connection testing
   - Test save flow

### E2E Tests

- Full settings flow: select Jellyfin → configure → test → save
- Collection creation with Jellyfin

---

## E.11: Acceptance Criteria

- [ ] Media server selector works
- [ ] Jellyfin settings form validates correctly
- [ ] Connection test works
- [ ] Settings save correctly
- [ ] All forms use React Hook Form + Zod
- [ ] Mobile responsive
- [ ] Accessible (keyboard navigation, ARIA)

---

## Files Summary

### New Files (5)

| File | Purpose |
|------|---------|
| `hooks/useMediaServerType.ts` | Media server type hook |
| `components/Settings/MediaServerSettings/index.ts` | Exports |
| `components/Settings/MediaServerSettings/MediaServerSelector.tsx` | Server picker |
| `components/Settings/MediaServerSettings/JellyfinSettings.tsx` | Jellyfin config |
| `public/icons_logos/jellyfin.svg` | Jellyfin logo |

### Modified Files (5)

| File | Changes |
|------|---------|
| `pages/SettingsPage.tsx` | Add server selector |
| `api/settings.ts` | Add Jellyfin API calls |
| `components/Settings/PlexSettings.tsx` | Refactor to new folder |
| Server settings controller | Add Jellyfin endpoints |
| Server settings service | Add Jellyfin methods |
