import React, { Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BookingCalendar } from '@/components/BookingCalendar';
import { WorkingHoursSetup } from '@/components/WorkingHoursSetup';
import { BookingForm } from '@/components/BookingForm';
import { GoogleQuickFillButton } from '@/components/GoogleQuickFillButton';
import { useBooking } from '@/contexts/BookingContext';
import { Settings, Calendar, Users, Loader2, ShieldAlert, RefreshCw, BarChart3, UserRound, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { clearOwnerAuthToken, setOwnerAuthToken, toIsoDate } from '@/lib/api';

const OwnerAnalyticsDashboard = React.lazy(() =>
  import('@/components/OwnerAnalyticsDashboard').then((module) => ({
    default: module.OwnerAnalyticsDashboard,
  })),
);

const PatientDirectory = React.lazy(() =>
  import('@/components/PatientDirectory').then((module) => ({
    default: module.PatientDirectory,
  })),
);

export const BookingSystem: React.FC = () => {
  const { isOwnerMode, settings, bookings, loading, error, authError, refresh } = useBooking();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);

  const handleSlotSelect = (slotId: string) => {
    if (isOwnerMode) {
      return;
    }

    setSelectedSlotId(slotId);
    setShowBookingForm(true);
  };

  const closeBookingForm = () => {
    setShowBookingForm(false);
    setSelectedSlotId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-sm">
            <CardContent className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading ZeroBooker</span>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto flex min-h-screen items-center justify-center px-4">
          <OwnerSignInCard authError={authError} onRefresh={refresh} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
              {settings.businessName}
            </h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">{settings.description}</p>
          </div>

          {isOwnerMode ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link to={`/book/${settings.slug || 'zero-booker'}`}>Public page</Link>
              </Button>
            </div>
          ) : null}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Something needs attention</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isOwnerMode && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Bookings</p>
                    <p className="text-2xl font-semibold">{bookings.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Today's Appointments</p>
                    <p className="text-2xl font-semibold">
                      {bookings.filter((booking) => booking.timeSlot.date === toIsoDate(new Date()))
                        .length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Slot Duration</p>
                    <p className="text-2xl font-semibold">{settings.slotDuration}min</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isOwnerMode ? (
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="patients" className="flex items-center gap-2">
                <UserRound className="h-4 w-4" />
                Patients
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <Suspense fallback={<PanelLoading />}>
                <OwnerAnalyticsDashboard />
              </Suspense>
            </TabsContent>

            <TabsContent value="calendar">
              <BookingCalendar />
            </TabsContent>

            <TabsContent value="patients">
              <Suspense fallback={<PanelLoading />}>
                <PatientDirectory />
              </Suspense>
            </TabsContent>

            <TabsContent value="settings">
              <WorkingHoursSetup />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-normal">Book an Appointment</h2>
              <p className="mt-2 text-muted-foreground">
                Select a date and time that works for you. Each appointment is{' '}
                {settings.slotDuration} minutes long.
              </p>
            </div>
            <BookingCalendar onSlotSelect={handleSlotSelect} />
          </div>
        )}

        {!isOwnerMode ? (
          <footer className="mt-12 border-t border-black/10 pt-6 text-right">
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <Link to="/owner">Owner access</Link>
            </Button>
          </footer>
        ) : null}

        <Dialog open={showBookingForm} onOpenChange={setShowBookingForm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Book Your Appointment</DialogTitle>
            </DialogHeader>
            {selectedSlotId && <BookingForm selectedSlotId={selectedSlotId} onClose={closeBookingForm} />}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default BookingSystem;

function PanelLoading() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading</span>
      </CardContent>
    </Card>
  );
}

function OwnerSignInCard({
  authError,
  onRefresh,
}: {
  authError: string;
  onRefresh: () => Promise<void>;
}) {
  const { settings } = useBooking();
  const [signingIn, setSigningIn] = useState(false);
  const googleClientId = settings.googleClientId || '';

  const handleCredential = (credential: string) => {
    setSigningIn(true);
    setOwnerAuthToken(credential);
    void onRefresh().finally(() => setSigningIn(false));
  };

  const handleRetry = () => {
    clearOwnerAuthToken();
    void onRefresh();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Owner sign-in
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{authError}</p>

        {googleClientId ? (
          <GoogleQuickFillButton
            clientId={googleClientId}
            disabled={signingIn}
            onCredential={handleCredential}
          />
        ) : (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Google sign-in is not configured</AlertTitle>
            <AlertDescription>Add a Google OAuth Web Client ID to continue.</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button onClick={handleRetry} variant="outline" disabled={signingIn}>
            {signingIn ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Retry
          </Button>
          <Button asChild>
            <Link to={`/book/${settings.slug || 'zero-booker'}`}>Public page</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
