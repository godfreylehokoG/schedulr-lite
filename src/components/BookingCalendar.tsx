import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBooking } from '@/contexts/BookingContext';
import { format, startOfDay } from 'date-fns';
import { Clock, User, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingStatus } from '@/types/booking';
import { toIsoDate } from '@/lib/api';

interface BookingCalendarProps {
  onSlotSelect?: (slotId: string) => void;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
};

export const BookingCalendar: React.FC<BookingCalendarProps> = ({ onSlotSelect }) => {
  const {
    timeSlots,
    bookings,
    isOwnerMode,
    loadingAvailability,
    saving,
    updateBookingStatus,
  } = useBooking();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateKey = toIsoDate(selectedDate);

  const selectedDateSlots = timeSlots.filter((slot) => slot.date === selectedDateKey);
  const availableSlots = selectedDateSlots.filter((slot) => !slot.isBooked);
  const bookedSlots = selectedDateSlots.filter((slot) => slot.isBooked);
  const ownerBookingsForDate = bookings.filter((booking) => booking.timeSlot.date === selectedDateKey);
  const hasSlots = selectedDateSlots.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            Select a Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            disabled={(date) => date < startOfDay(new Date())}
            className="rounded-md border-0"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Available Times - {format(selectedDate, 'EEEE, MMMM do')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAvailability ? (
            <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading availability</span>
            </div>
          ) : !hasSlots ? (
            <div className="py-8 text-center text-muted-foreground">
              <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No time slots available for this date</p>
            </div>
          ) : (
            <div className="space-y-5">
              {availableSlots.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">Available Slots</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot.id}
                        variant="outline"
                        size="sm"
                        onClick={() => onSlotSelect?.(slot.id)}
                        disabled={isOwnerMode || !onSlotSelect}
                        className={cn(
                          'justify-center border-black/10 bg-white/75 text-foreground shadow-sm backdrop-blur',
                          'hover:border-black hover:bg-foreground hover:text-background hover:scale-[1.02]',
                        )}
                      >
                        {slot.startTime}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {bookedSlots.length > 0 && isOwnerMode && (
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">Booked Slots</h4>
                  <div className="space-y-2">
                    {bookedSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="grid gap-3 rounded-lg border border-black/10 bg-black/[0.03] p-3 sm:grid-cols-[1fr_auto]"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">
                              {slot.startTime} - {slot.endTime}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>{slot.bookedBy}</span>
                          </div>
                        </div>
                        {slot.bookingId && (
                          <Select
                            value={slot.status || 'confirmed'}
                            onValueChange={(value) =>
                              void updateBookingStatus(slot.bookingId!, value as BookingStatus)
                            }
                            disabled={saving}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ownerBookingsForDate.length > bookedSlots.length && isOwnerMode && (
                <div>
                  <h4 className="mb-3 font-medium">Other Bookings</h4>
                  <div className="space-y-2">
                    {ownerBookingsForDate
                      .filter((booking) => booking.status !== 'confirmed')
                      .map((booking) => (
                        <div
                          key={booking.id}
                          className="grid gap-3 rounded-lg border border-black/10 bg-white/60 p-3 sm:grid-cols-[1fr_auto]"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              <span className="font-medium">
                                {booking.timeSlot.startTime} - {booking.timeSlot.endTime}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-4 w-4" />
                              <span>{booking.customerName}</span>
                            </div>
                          </div>
                          <Select
                            value={booking.status}
                            onValueChange={(value) =>
                              void updateBookingStatus(booking.id, value as BookingStatus)
                            }
                            disabled={saving}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {availableSlots.length === 0 && bookedSlots.length > 0 && !isOwnerMode && (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>All slots are booked for this date</p>
                  <p className="text-sm">Please select another date</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
