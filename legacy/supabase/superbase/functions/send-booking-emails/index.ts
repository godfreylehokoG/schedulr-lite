import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface EmailRequest {
  booking: any;
  businessName: string;
  ownerEmail?: string;
  customerEmail: string;
  icsContent: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { booking, businessName, ownerEmail, customerEmail, icsContent }: EmailRequest = await req.json();

    // Here you would integrate with your email provider
    // Example with Resend:
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (!RESEND_API_KEY) {
      throw new Error('Email service not configured');
    }

    // Send customer confirmation email
    const customerEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${businessName} <noreply@send.zeroindex.co.za>`,
        to: customerEmail,
        subject: `Appointment Confirmation - ${businessName}`,
        html: `
          <h2>Your appointment is confirmed!</h2>
          <p>Dear ${booking.customerName},</p>
          <p>Your appointment has been scheduled for:</p>
          <ul>
            <li><strong>Date:</strong> ${booking.timeSlot.date}</li>
            <li><strong>Time:</strong> ${booking.timeSlot.startTime} - ${booking.timeSlot.endTime}</li>
          </ul>
          ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
          <p>A calendar invitation is attached to this email.</p>
          <p>Thank you for booking with ${businessName}!</p>
        `,
        attachments: [
          {
            filename: 'appointment.ics',
            content: Buffer.from(icsContent).toString('base64'),
          },
        ],
      }),
    });

    if (!customerEmailResponse.ok) {
      const error = await customerEmailResponse.text();
      throw new Error(`Failed to send customer email: ${error}`);
    }

    // Send owner notification if email is provided
    if (ownerEmail) {
      const ownerEmailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${businessName} <noreply@send.zeroindex.co.za>`,
          to: ownerEmail,
          subject: `New Booking - ${booking.customerName}`,
          html: `
            <h2>New booking received!</h2>
            <p>A new appointment has been booked:</p>
            <ul>
              <li><strong>Customer:</strong> ${booking.customerName}</li>
              <li><strong>Email:</strong> ${booking.customerEmail}</li>
              <li><strong>Phone:</strong> ${booking.customerPhone || 'Not provided'}</li>
              <li><strong>Date:</strong> ${booking.timeSlot.date}</li>
              <li><strong>Time:</strong> ${booking.timeSlot.startTime} - ${booking.timeSlot.endTime}</li>
              ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
            </ul>
          `,
          attachments: [
            {
              filename: 'appointment.ics',
              content: Buffer.from(icsContent).toString('base64'),
            },
          ],
        }),
      });

      if (!ownerEmailResponse.ok) {
        console.error('Failed to send owner notification:', await ownerEmailResponse.text());
        // Don't throw here - customer email was sent successfully
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Emails sent successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Email function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});