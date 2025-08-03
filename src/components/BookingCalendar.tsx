import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBooking } from '@/contexts/BookingContext';
import { format, startOfDay, isSameDay } from 'date-fns';
import { Clock, User, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingCalendarProps {
  onSlotSelect?: (slotId: string) => void;
}

export const BookingCalendar: React.FC<BookingCalendarProps> = ({ onSlotSelect }) => {
  const { timeSlots, isOwnerMode } = useBooking();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const selectedDateSlots = timeSlots.filter(slot => 
    isSameDay(new Date(slot.date), selectedDate)
  );

  const availableSlots = selectedDateSlots.filter(slot => !slot.isBooked);
  const bookedSlots = selectedDateSlots.filter(slot => slot.isBooked);

  const hasSlots = selectedDateSlots.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
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
            <Clock className="h-5 w-5" />
            Available Times - {format(selectedDate, 'EEEE, MMMM do')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSlots ? (
            <div className="text-center text-muted-foreground py-8">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No time slots available for this date</p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableSlots.length > 0 && (
                <div>
                  <h4 className="font-medium text-available-foreground mb-3">Available Slots</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableSlots.map(slot => (
                      <Button
                        key={slot.id}
                        variant="outline"
                        size="sm"
                        onClick={() => onSlotSelect?.(slot.id)}
                        className={cn(
                          "justify-center bg-available/20 border-available hover:bg-available/30",
                          "transition-all duration-200 hover:scale-105"
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
                  <h4 className="font-medium text-booked-foreground mb-3">Booked Slots</h4>
                  <div className="space-y-2">
                    {bookedSlots.map(slot => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between p-3 bg-booked/20 border border-booked rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">{slot.startTime} - {slot.endTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{slot.bookedBy}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {availableSlots.length === 0 && bookedSlots.length > 0 && !isOwnerMode && (
                <div className="text-center text-muted-foreground py-8">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
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