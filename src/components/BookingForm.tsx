import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/hooks/use-toast';
import { downloadIcsFile } from '@/lib/calendarUtils';
import { ApiError } from '@/lib/api';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { GoogleQuickFillButton } from '@/components/GoogleQuickFillButton';
import { User, Mail, Phone, MessageSquare, Calendar, Clock, Loader2 } from 'lucide-react';

interface BookingFormProps {
  selectedSlotId: string;
  onClose: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({ selectedSlotId, onClose }) => {
  const { timeSlots, bookTimeSlot, settings } = useBooking();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
  });

  const selectedSlot = timeSlots.find((slot) => slot.id === selectedSlotId);
  const turnstileRequired = Boolean(settings.turnstileRequired);
  const canSubmit = !submitting && (!turnstileRequired || Boolean(turnstileToken));

  const handleGoogleProfile = useCallback(
    (profile: { name: string; email: string }) => {
      setFormData((prev) => ({
        ...prev,
        customerName: prev.customerName || profile.name,
        customerEmail: profile.email,
      }));
      toast({
        title: 'Details filled',
        description: 'Your Google profile filled the booking form.',
      });
    },
    [toast],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.customerName || !formData.customerEmail) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in your name and email address.',
        variant: 'destructive',
      });
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      toast({
        title: 'Verification needed',
        description: 'Please complete booking verification.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const confirmation = await bookTimeSlot(
        selectedSlotId,
        formData,
        turnstileRequired ? turnstileToken : 'dev-turnstile-token',
        crypto.randomUUID(),
      );

      toast({
        title: 'Booking Confirmed!',
        description: confirmation.manageUrl
          ? `Your appointment is scheduled for ${confirmation.date} at ${confirmation.startTime}. Confirmation email sent.`
          : `Your appointment is scheduled for ${confirmation.date} at ${confirmation.startTime}.`,
      });

      const calendarBooking = {
        id: confirmation.id,
        businessId: settings.businessId || '',
        ...formData,
        appointmentStartUtc: confirmation.appointmentStartUtc,
        appointmentEndUtc: confirmation.appointmentEndUtc,
        timeSlot: {
          ...selectedSlot!,
          date: confirmation.date,
          startTime: confirmation.startTime,
          endTime: confirmation.endTime,
          isBooked: true,
          bookedBy: formData.customerName,
          bookedAt: new Date(),
        },
        status: confirmation.status,
        createdAt: new Date(),
      };

      setTimeout(() => {
        if (window.confirm('Would you like to download a calendar file for this appointment?')) {
          downloadIcsFile(calendarBooking, settings.businessName);
        }
      }, 300);

      onClose();
    } catch (error) {
      const description =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'There was an error processing your booking. Please try again.';

      toast({
        title: error instanceof ApiError && error.code === 'slot_conflict' ? 'Time Unavailable' : 'Booking Failed',
        description,
        variant: 'destructive',
      });
      setTurnstileToken('');
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedSlot) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 space-y-2">
        <h3 className="text-lg font-semibold">Book Your Appointment</h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{selectedSlot.date}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>
              {selectedSlot.startTime} - {selectedSlot.endTime}
            </span>
          </div>
        </div>
      </div>
      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <GoogleQuickFillButton
            clientId={settings.googleClientId}
            disabled={submitting}
            onProfile={handleGoogleProfile}
          />

          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Full Name *
            </Label>
            <Input
              id="name"
              value={formData.customerName}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, customerName: event.target.value }))
              }
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
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, customerEmail: event.target.value }))
              }
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
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, customerPhone: event.target.value }))
              }
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
              onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Any additional information or special requests"
              className="min-h-[100px]"
              disabled={submitting}
            />
          </div>

          {turnstileRequired && settings.turnstileSiteKey ? (
            <TurnstileWidget
              siteKey={settings.turnstileSiteKey}
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken('')}
            />
          ) : null}

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
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Booking'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
