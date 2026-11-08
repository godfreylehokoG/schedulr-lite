import { useCallback, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Booking } from '@/types/booking';
import { generateIcsFile } from '@/lib/calendarUtils';
import { useToast } from '@/hooks/use-toast';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface EmailNotificationOptions {
  booking: Booking;
  businessName: string;
  ownerEmail?: string;
  customerEmail: string;
}

export const useEmailNotifications = () => {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const sendBookingEmails = useCallback(async (options: EmailNotificationOptions) => {
    setSending(true);
    
    try {
      const icsContent = generateIcsFile(options.booking, options.businessName);
      
      const { data, error } = await supabase.functions.invoke('send-booking-emails', {
        body: {
          booking: options.booking,
          businessName: options.businessName,
          ownerEmail: options.ownerEmail,
          customerEmail: options.customerEmail,
          icsContent,
        },
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Failed to send email notifications:', error);
      toast({
        title: "Email notification failed",
        description: "Booking confirmed but email couldn't be sent",
        variant: "destructive",
      });
      return { success: false, error };
    } finally {
      setSending(false);
    }
  }, [toast]);

  return {
    sendBookingEmails,
    sending,
  };
};