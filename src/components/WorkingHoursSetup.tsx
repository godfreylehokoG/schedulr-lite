import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBooking } from '@/contexts/BookingContext';
import { GoogleCalendarIntegration } from '@/components/GoogleCalendarIntegration';
import { Clock, Settings, Mail } from 'lucide-react';

const DAYS = [
  'Sunday',
  'Monday', 
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

const DURATION_OPTIONS = [
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
];

export const WorkingHoursSetup: React.FC = () => {
  const { settings, updateSettings } = useBooking();

  const updateWorkingHour = (dayIndex: number, field: keyof typeof settings.workingHours[0], value: any) => {
    const newWorkingHours = [...settings.workingHours];
    newWorkingHours[dayIndex] = { ...newWorkingHours[dayIndex], [field]: value };
    updateSettings({ workingHours: newWorkingHours });
  };

  const toggleAllDays = (enabled: boolean) => {
    const newWorkingHours = settings.workingHours.map(wh => ({ ...wh, enabled }));
    updateSettings({ workingHours: newWorkingHours });
  };

  const setAllSameHours = () => {
    const mondayHours = settings.workingHours[1]; // Use Monday as template
    const newWorkingHours = settings.workingHours.map(wh => ({
      ...wh,
      startTime: mondayHours.startTime,
      endTime: mondayHours.endTime,
    }));
    updateSettings({ workingHours: newWorkingHours });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Business Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={settings.businessName}
                onChange={(e) => updateSettings({ businessName: e.target.value })}
                placeholder="Enter your business name"
              />
            </div>
            <div>
              <Label htmlFor="slotDuration">Appointment Duration</Label>
              <Select 
                value={settings.slotDuration.toString()} 
                onValueChange={(value) => updateSettings({ slotDuration: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={settings.description}
                onChange={(e) => updateSettings({ description: e.target.value })}
                placeholder="Brief description of your service"
              />
            </div>
            <div>
              <Label htmlFor="ownerEmail" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Notification Email
              </Label>
              <Input
                id="ownerEmail"
                type="email"
                value={settings.ownerEmail || ''}
                onChange={(e) => updateSettings({ ownerEmail: e.target.value })}
                placeholder="owner@example.com"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                You'll receive booking notifications at this email
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar Integration */}
      <GoogleCalendarIntegration />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Working Hours
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
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
                <div key={day} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center p-4 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={workingHour.enabled}
                      onCheckedChange={(checked) => updateWorkingHour(index, 'enabled', checked)}
                    />
                    <Label className="min-w-[80px] font-medium">{day}</Label>
                  </div>
                  
                  <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Start Time</Label>
                      <Input
                        type="time"
                        value={workingHour.startTime}
                        onChange={(e) => updateWorkingHour(index, 'startTime', e.target.value)}
                        disabled={!workingHour.enabled}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End Time</Label>
                      <Input
                        type="time"
                        value={workingHour.endTime}
                        onChange={(e) => updateWorkingHour(index, 'endTime', e.target.value)}
                        disabled={!workingHour.enabled}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    {workingHour.enabled ? (
                      <span className="text-success-foreground">
                        Open {workingHour.startTime} - {workingHour.endTime}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Closed</span>
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