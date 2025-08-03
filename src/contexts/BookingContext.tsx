import React, { createContext, useContext, useState, useEffect } from 'react';
import { BookingSettings, TimeSlot, Booking, WorkingHours } from '@/types/booking';

interface BookingContextType {
  settings: BookingSettings;
  updateSettings: (settings: Partial<BookingSettings>) => void;
  timeSlots: TimeSlot[];
  bookings: Booking[];
  bookTimeSlot: (slotId: string, booking: Omit<Booking, 'id' | 'timeSlot' | 'createdAt'>) => void;
  generateTimeSlots: (startDate: Date, endDate: Date) => void;
  isOwnerMode: boolean;
  setIsOwnerMode: (isOwner: boolean) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const defaultWorkingHours: WorkingHours[] = [
  { day: 0, enabled: false, startTime: '09:00', endTime: '17:00' }, // Sunday
  { day: 1, enabled: true, startTime: '09:00', endTime: '17:00' },  // Monday
  { day: 2, enabled: true, startTime: '09:00', endTime: '17:00' },  // Tuesday
  { day: 3, enabled: true, startTime: '09:00', endTime: '17:00' },  // Wednesday
  { day: 4, enabled: true, startTime: '09:00', endTime: '17:00' },  // Thursday
  { day: 5, enabled: true, startTime: '09:00', endTime: '17:00' },  // Friday
  { day: 6, enabled: false, startTime: '09:00', endTime: '17:00' }, // Saturday
];

const defaultSettings: BookingSettings = {
  slotDuration: 30,
  workingHours: defaultWorkingHours,
  businessName: 'My Business',
  description: 'Book an appointment with us',
};

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BookingSettings>(defaultSettings);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isOwnerMode, setIsOwnerMode] = useState(false);

  const updateSettings = (newSettings: Partial<BookingSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const generateTimeSlots = (startDate: Date, endDate: Date) => {
    const slots: TimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const workingHour = settings.workingHours.find(wh => wh.day === dayOfWeek);

      if (workingHour && workingHour.enabled) {
        const startTime = new Date(currentDate);
        const [startHour, startMinute] = workingHour.startTime.split(':').map(Number);
        startTime.setHours(startHour, startMinute, 0, 0);

        const endTime = new Date(currentDate);
        const [endHour, endMinute] = workingHour.endTime.split(':').map(Number);
        endTime.setHours(endHour, endMinute, 0, 0);

        let slotStart = new Date(startTime);
        while (slotStart < endTime) {
          const slotEnd = new Date(slotStart.getTime() + settings.slotDuration * 60000);
          if (slotEnd <= endTime) {
            const slotId = `${currentDate.toDateString()}-${slotStart.toTimeString().slice(0, 5)}`;
            const existingBooking = bookings.find(b => b.timeSlot.id === slotId);
            
            slots.push({
              id: slotId,
              date: currentDate.toDateString(),
              startTime: slotStart.toTimeString().slice(0, 5),
              endTime: slotEnd.toTimeString().slice(0, 5),
              isBooked: !!existingBooking,
              bookedBy: existingBooking?.customerName,
              bookedAt: existingBooking?.createdAt,
            });
          }
          slotStart = new Date(slotStart.getTime() + settings.slotDuration * 60000);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    setTimeSlots(slots);
  };

  const bookTimeSlot = (slotId: string, bookingData: Omit<Booking, 'id' | 'timeSlot' | 'createdAt'>) => {
    const slot = timeSlots.find(s => s.id === slotId);
    if (!slot || slot.isBooked) return;

    const newBooking: Booking = {
      id: `booking-${Date.now()}`,
      ...bookingData,
      timeSlot: { ...slot, isBooked: true, bookedBy: bookingData.customerName, bookedAt: new Date() },
      createdAt: new Date(),
    };

    setBookings(prev => [...prev, newBooking]);
    setTimeSlots(prev => prev.map(slot => 
      slot.id === slotId 
        ? { ...slot, isBooked: true, bookedBy: bookingData.customerName, bookedAt: new Date() }
        : slot
    ));
  };

  useEffect(() => {
    // Generate slots for the next 30 days
    const today = new Date();
    const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    generateTimeSlots(today, thirtyDaysLater);
  }, [settings]);

  return (
    <BookingContext.Provider value={{
      settings,
      updateSettings,
      timeSlots,
      bookings,
      bookTimeSlot,
      generateTimeSlots,
      isOwnerMode,
      setIsOwnerMode,
    }}>
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};