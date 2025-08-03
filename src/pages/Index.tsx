import { BookingProvider } from '@/contexts/BookingContext';
import BookingSystem from '@/pages/BookingSystem';

const Index = () => {
  return (
    <BookingProvider>
      <BookingSystem />
    </BookingProvider>
  );
};

export default Index;
