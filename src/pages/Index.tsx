import { BookingProvider } from '@/contexts/BookingContext';
import BookingSystem from '@/pages/BookingSystem';
import { useParams } from 'react-router-dom';

interface IndexProps {
  mode?: 'public' | 'owner';
}

const Index = ({ mode = 'public' }: IndexProps) => {
  const { slug, businessId } = useParams();

  return (
    <BookingProvider mode={mode} slug={slug || 'zero-booker'} businessId={businessId}>
      <BookingSystem />
    </BookingProvider>
  );
};

export default Index;
