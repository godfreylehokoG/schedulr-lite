import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';
import { insertGoogleCalendarEvent, downloadIcsFile } from '@/lib/calendarUtils';
import { createClient } from '@supabase/supabase-js';
import { User, Mail, Phone, MessageSquare, Calendar, Clock, Loader2, Download } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface BookingFormProps {
  selectedSlotId: string;
  onClose: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({ selectedSlotId, onClose }) => {
  const { timeSlots, bookTimeSlot, settings, bookings } = useBooking();
  const { toast } = useToast();
  const { sendBookingEmails, sending } = useEmailNotifications();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
  });

  const selectedSlot = timeSlots.find(slot => slot.id === selectedSlotId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customerName || !formData.customerEmail) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name and email address.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create the booking
      bookTimeSlot(selectedSlotId, formData);
      
      // Get the booking that was just created
      const newBooking = {
        id: `booking-${Date.now()}`,
        ...formData,
        timeSlot: selectedSlot!,
        createdAt: new Date(),
      };

      // 2. Send email notifications
      const emailResult = await sendBookingEmails({
        booking: newBooking,
        businessName: settings.businessName,
        ownerEmail: settings.ownerEmail,
        customerEmail: formData.customerEmail,
      });

      // 3. Try to sync with Google Calendar (if owner is logged in)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token) {
          const calendarResult = await insertGoogleCalendarEvent(
            session.provider_token,
            newBooking,
            settings.businessName
          );
          
          if (!calendarResult.success) {
            console.error('Failed to sync with Google Calendar:', calendarResult.error);
          }
        }
      } catch (calendarError) {
        // Don't fail the booking if calendar sync fails
        console.error('Calendar sync error:', calendarError);
      }

      // 4. Show success message
      toast({
        title: "Booking Confirmed!",
        description: (
          <div className="space-y-2">
            <p>Your appointment has been scheduled for {selectedSlot?.date} at {selectedSlot?.startTime}.</p>
            {emailResult.success && (
              <p className="text-sm">A confirmation email has been sent to {formData.customerEmail}</p>
            )}
          </div>
        ),
      });

      // 5. Offer to download ICS file
      setTimeout(() => {
        if (window.confirm('Would you like to download a calendar file for this appointment?')) {
          downloadIcsFile(newBooking, settings.businessName);
        }
      }, 500);

      onClose();
    } catch (error) {
      console.error('Booking error:', error);
      toast({
        title: "Booking Failed",
        description: "There was an error processing your booking. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedSlot) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Book Your Appointment</CardTitle>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{selectedSlot.date}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{selectedSlot.startTime} - {selectedSlot.endTime}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Full Name *
            </Label>
            <Input
              id="name"
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                            placeholder="Enter your full name"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address *
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.customerEmail}
              onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
              placeholder="Enter your email address"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.customerPhone}
              onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
              placeholder="Enter your phone number"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional information or special requests"
              className="min-h-[100px]"
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              className="flex-1"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-success hover:bg-success/90"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Confirm Booking'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};