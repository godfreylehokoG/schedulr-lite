import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { format, startOfDay } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { addDays, ApiError, api, toIsoDate } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ManagedBooking, TimeSlot } from '@/types/booking';

const STATUS_LABELS: Record<ManagedBooking['status'], string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
};

export default function ManageBooking() {
  const { token = '' } = useParams();
  const { toast } = useToast();
  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api
      .getManagedBooking(token)
      .then((managedBooking) => {
        if (!active) {
          return;
        }
        setBooking(managedBooking);
        setSelectedDate(new Date(managedBooking.appointmentStartUtc));
      })
      .catch((err) => {
        if (active) {
          setError(messageFromError(err, 'This booking link could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!booking?.canReschedule) {
      setSlots([]);
      return;
    }

    let active = true;
    setLoadingSlots(true);
    const from = toIsoDate(new Date());
    const to = toIsoDate(addDays(new Date(), 30));

    api
      .getAvailability(booking.businessSlug, from, to)
      .then((availability) => {
        if (active) {
          setSlots(availability.filter((slot) => !slot.isBooked));
        }
      })
      .catch((err) => {
        if (active) {
          toast({
            title: 'Availability unavailable',
            description: messageFromError(err, 'Available times could not be loaded.'),
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSlots(false);
        }
      });

    return () => {
      active = false;
    };
  }, [booking?.businessSlug, booking?.canReschedule, toast]);

  const selectedDateKey = toIsoDate(selectedDate);
  const selectedDateSlots = useMemo(
    () => slots.filter((slot) => slot.date === selectedDateKey),
    [selectedDateKey, slots],
  );

  const handleCancel = async () => {
    setSaving(true);
    try {
      const updated = await api.cancelManagedBooking(token);
      setBooking(updated);
      setSlots([]);
      toast({
        title: 'Booking cancelled',
        description: 'A cancellation email is on its way.',
      });
    } catch (err) {
      toast({
        title: 'Could not cancel',
        description: messageFromError(err, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async (slot: TimeSlot) => {
    setSaving(true);
    try {
      const updated = await api.rescheduleManagedBooking(token, slot.startUtc);
      setBooking(updated);
      setSelectedDate(new Date(updated.appointmentStartUtc));
      toast({
        title: 'Booking rescheduled',
        description: `Your appointment is now ${updated.date} at ${updated.startTime}.`,
      });
    } catch (err) {
      toast({
        title: err instanceof ApiError && err.code === 'slot_conflict' ? 'Time unavailable' : 'Could not reschedule',
        description: messageFromError(err, 'Please choose another time.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <Card className="mx-auto w-full max-w-sm">
          <CardContent className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading booking</span>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !booking) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-xl space-y-4">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Booking link unavailable</AlertTitle>
            <AlertDescription>{error || 'This booking link could not be loaded.'}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link to="/book/zero-booker">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Public booking page
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-4">
              <Link to={`/book/${booking.businessSlug}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Public page
              </Link>
            </Button>
            <h1 className="text-4xl font-semibold tracking-normal text-foreground">
              Manage booking
            </h1>
            <p className="mt-2 text-muted-foreground">{booking.businessName}</p>
          </div>
          <Badge
            variant={booking.status === 'confirmed' ? 'default' : 'outline'}
            className={cn(
              'w-fit px-3 py-1',
              booking.status === 'confirmed' ? 'bg-foreground text-background' : 'border-black/15',
            )}
          >
            {STATUS_LABELS[booking.status]}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                Appointment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-black/10 bg-black/[0.03] p-5">
                <p className="text-sm font-medium text-muted-foreground">{booking.date}</p>
                <p className="mt-2 text-3xl font-semibold tracking-normal">
                  {booking.startTime} - {booking.endTime}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{booking.timezone}</p>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">{booking.customerName}</p>
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {booking.customerEmail}
                  </p>
                  {booking.customerPhone ? (
                    <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {booking.customerPhone}
                    </p>
                  ) : null}
                </div>
                {booking.notes ? (
                  <p className="rounded-lg border border-black/10 bg-white/70 p-3 text-muted-foreground">
                    {booking.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {booking.googleCalendarUrl ? (
                  <Button asChild className="flex-1">
                    <a href={booking.googleCalendarUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Add to Google
                    </a>
                  </Button>
                ) : null}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={!booking.canCancel || saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This releases the time slot and sends a cancellation email.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep booking</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleCancel()}>
                        Cancel booking
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {!booking.canCancel ? (
                <p className="text-sm text-muted-foreground">
                  This booking cannot be changed from this link.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-muted-foreground" />
                Reschedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              {booking.canReschedule ? (
                <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date < startOfDay(new Date())}
                    className="rounded-md border-0"
                  />

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                      {format(selectedDate, 'EEEE, MMMM do')}
                    </h3>
                    {loadingSlots ? (
                      <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading available times
                      </div>
                    ) : selectedDateSlots.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {selectedDateSlots.map((slot) => (
                          <Button
                            key={slot.id}
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={() => void handleReschedule(slot)}
                            className="justify-center border-black/10 bg-white/75 shadow-sm backdrop-blur hover:border-black hover:bg-foreground hover:text-background"
                          >
                            <Clock className="mr-2 h-4 w-4" />
                            {slot.startTime}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="py-8 text-sm text-muted-foreground">
                        No open times for this date.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Rescheduling is no longer available for this booking.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto flex min-h-screen px-4 py-10 sm:py-14">{children}</main>
    </div>
  );
}

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
