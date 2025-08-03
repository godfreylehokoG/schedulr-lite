import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookingCalendar } from '@/components/BookingCalendar';
import { WorkingHoursSetup } from '@/components/WorkingHoursSetup';
import { BookingForm } from '@/components/BookingForm';
import { useBooking } from '@/contexts/BookingContext';
import { Settings, Calendar, Users, ToggleLeft, ToggleRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const BookingSystem: React.FC = () => {
  const { isOwnerMode, setIsOwnerMode, settings, bookings } = useBooking();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);

  const handleSlotSelect = (slotId: string) => {
    setSelectedSlotId(slotId);
    setShowBookingForm(true);
  };

  const closeBookingForm = () => {
    setShowBookingForm(false);
    setSelectedSlotId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {settings.businessName}
            </h1>
            <p className="text-muted-foreground mt-1">
              {settings.description}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${!isOwnerMode ? 'font-medium' : 'text-muted-foreground'}`}>
                Customer
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOwnerMode(!isOwnerMode)}
                className="p-2"
              >
                {isOwnerMode ? (
                  <ToggleRight className="h-6 w-6 text-primary-foreground" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                )}
              </Button>
              <span className={`text-sm ${isOwnerMode ? 'font-medium' : 'text-muted-foreground'}`}>
                Owner
              </span>
            </div>
          </div>
        </div>

        {/* Stats for Owner Mode */}
        {isOwnerMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary-foreground" />
                  <div>
                    <p className="text-sm font-medium">Total Bookings</p>
                    <p className="text-2xl font-bold">{bookings.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-medium">Today's Appointments</p>
                    <p className="text-2xl font-bold">
                      {bookings.filter(b => 
                        new Date(b.timeSlot.date).toDateString() === new Date().toDateString()
                      ).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-warning" />
                  <div>
                    <p className="text-sm font-medium">Slot Duration</p>
                    <p className="text-2xl font-bold">{settings.slotDuration}min</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        {isOwnerMode ? (
          <Tabs defaultValue="calendar" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Calendar & Bookings
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="calendar">
              <BookingCalendar />
            </TabsContent>
            
            <TabsContent value="settings">
              <WorkingHoursSetup />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Book an Appointment</CardTitle>
                <p className="text-muted-foreground">
                  Select a date and time that works for you. Each appointment is {settings.slotDuration} minutes long.
                </p>
              </CardHeader>
              <CardContent>
                <BookingCalendar onSlotSelect={handleSlotSelect} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Booking Form Dialog */}
        <Dialog open={showBookingForm} onOpenChange={setShowBookingForm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Book Your Appointment</DialogTitle>
            </DialogHeader>
            {selectedSlotId && (
              <BookingForm 
                selectedSlotId={selectedSlotId} 
                onClose={closeBookingForm}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default BookingSystem;