import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/hooks/use-toast';
import { Clock, Loader2, Mail, Save, Settings } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DURATION_OPTIONS = [
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
];

export const WorkingHoursSetup: React.FC = () => {
  const { settings, updateSettings, saveSettings, saveWorkingHours, saving } = useBooking();
  const { toast } = useToast();
  const [dirty, setDirty] = useState(false);

  const hasInvalidHours = settings.workingHours.some(
    (workingHour) => workingHour.enabled && workingHour.startTime >= workingHour.endTime,
  );

  const updateSettingDraft = (newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings);
    setDirty(true);
  };

  const updateWorkingHour = (
    dayIndex: number,
    field: keyof (typeof settings.workingHours)[0],
    value: boolean | string,
  ) => {
    const newWorkingHours = [...settings.workingHours];
    newWorkingHours[dayIndex] = { ...newWorkingHours[dayIndex], [field]: value };
    updateSettingDraft({ workingHours: newWorkingHours });
  };

  const toggleAllDays = (enabled: boolean) => {
    updateSettingDraft({
      workingHours: settings.workingHours.map((workingHour) => ({ ...workingHour, enabled })),
    });
  };

  const setAllSameHours = () => {
    const mondayHours = settings.workingHours[1];
    updateSettingDraft({
      workingHours: settings.workingHours.map((workingHour) => ({
        ...workingHour,
        startTime: mondayHours.startTime,
        endTime: mondayHours.endTime,
      })),
    });
  };

  const saveChanges = async () => {
    if (hasInvalidHours) {
      return;
    }

    try {
      await saveSettings();
      await saveWorkingHours(settings.workingHours);
      setDirty(false);
      toast({
        title: 'Settings saved',
        description: 'ZeroBooker settings and working hours were updated.',
      });
    } catch (error) {
      toast({
        title: 'Save failed',
        description:
          error instanceof Error ? error.message : 'Settings could not be saved. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {hasInvalidHours && (
        <Alert variant="destructive">
          <AlertDescription>Start time must be before end time for every open day.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            Business Settings
          </CardTitle>
          <Button onClick={() => void saveChanges()} disabled={!dirty || saving || hasInvalidHours}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={settings.businessName}
                onChange={(event) => updateSettingDraft({ businessName: event.target.value })}
                placeholder="Enter your business name"
              />
            </div>
            <div>
              <Label htmlFor="slotDuration">Appointment Duration</Label>
              <Select
                value={settings.slotDuration.toString()}
                onValueChange={(value) => updateSettingDraft({ slotDuration: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={settings.description}
                onChange={(event) => updateSettingDraft({ description: event.target.value })}
                placeholder="Brief description of your service"
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={settings.timezone}
                onChange={(event) => updateSettingDraft({ timezone: event.target.value })}
                placeholder="Africa/Johannesburg"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ownerEmail" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Notification Email
            </Label>
            <Input
              id="ownerEmail"
              type="email"
              value={settings.ownerEmail || ''}
              onChange={(event) => updateSettingDraft({ ownerEmail: event.target.value })}
              placeholder="owner@example.com"
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Working Hours
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAllDays(true)}>
              Enable All Days
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleAllDays(false)}>
              Disable All Days
            </Button>
            <Button variant="outline" size="sm" onClick={setAllSameHours}>
              Copy Monday Hours
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {DAYS.map((day, index) => {
              const workingHour = settings.workingHours[index];
              return (
                <div
                  key={day}
                  className="grid grid-cols-1 items-center gap-4 rounded-lg border border-black/10 bg-white/55 p-4 md:grid-cols-5"
                >
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={workingHour.enabled}
                      onCheckedChange={(checked) => updateWorkingHour(index, 'enabled', checked)}
                    />
                    <Label className="min-w-[80px] font-medium">{day}</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:col-span-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Start Time</Label>
                      <Input
                        type="time"
                        value={workingHour.startTime}
                        onChange={(event) => updateWorkingHour(index, 'startTime', event.target.value)}
                        disabled={!workingHour.enabled}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End Time</Label>
                      <Input
                        type="time"
                        value={workingHour.endTime}
                        onChange={(event) => updateWorkingHour(index, 'endTime', event.target.value)}
                        disabled={!workingHour.enabled}
                      />
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground md:col-span-2">
                    {workingHour.enabled ? (
                      <span className="text-foreground">
                        Open {workingHour.startTime} - {workingHour.endTime}
                      </span>
                    ) : (
                      <span>Closed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
