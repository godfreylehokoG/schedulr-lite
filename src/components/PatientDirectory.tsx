import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBooking } from '@/contexts/BookingContext';
import { Booking, BookingStatus } from '@/types/booking';
import { CalendarDays, Mail, Phone, Search, UserRound } from 'lucide-react';

interface PatientRecord {
  email: string;
  name: string;
  phone: string;
  visits: Booking[];
  upcoming: Booking[];
  lastVisit: Booking;
  latestNotes: string;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
};

export const PatientDirectory: React.FC = () => {
  const { bookings } = useBooking();
  const [query, setQuery] = useState('');
  const patients = useMemo(() => buildPatientRecords(bookings), [bookings]);
  const filteredPatients = useMemo(() => filterPatients(patients, query), [patients, query]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const selectedPatient = filteredPatients.find((patient) => patient.email === selectedEmail) || filteredPatients[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">Patients</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {patients.length} past patient{patients.length === 1 ? '' : 's'} on record
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patients"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Past Patient List</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPatients.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/50 text-sm text-muted-foreground">
                No past patients match this search
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Visits</TableHead>
                    <TableHead>Last Visit</TableHead>
                    <TableHead>Upcoming</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((patient) => (
                    <TableRow
                      key={patient.email}
                      onClick={() => setSelectedEmail(patient.email)}
                      className="cursor-pointer"
                      data-state={selectedPatient?.email === patient.email ? 'selected' : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">{patient.name}</div>
                        <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                          {patient.latestNotes || 'No notes recorded'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{patient.email}</span>
                          </div>
                          {patient.phone ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{patient.phone}</span>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{patient.visits.length}</TableCell>
                      <TableCell>{formatDateTime(patient.lastVisit.appointmentStartUtc)}</TableCell>
                      <TableCell>{patient.upcoming.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-muted-foreground" />
              Patient Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/50 text-sm text-muted-foreground">
                No patient selected
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xl font-semibold">{selectedPatient.name}</p>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>{selectedPatient.email}</p>
                    {selectedPatient.phone ? <p>{selectedPatient.phone}</p> : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DetailMetric label="Past Visits" value={selectedPatient.visits.length} />
                  <DetailMetric label="Upcoming" value={selectedPatient.upcoming.length} />
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Visit History</p>
                  <div className="space-y-2">
                    {selectedPatient.visits.slice(0, 6).map((visit) => (
                      <div key={visit.id} className="rounded-lg border border-black/10 bg-white/55 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              {formatDateTime(visit.appointmentStartUtc)}
                            </div>
                            {visit.notes ? (
                              <p className="mt-2 text-sm text-muted-foreground">{visit.notes}</p>
                            ) : null}
                          </div>
                          <StatusBadge status={visit.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function DetailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/55 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="outline" className="border-black/10 bg-white/70 text-xs font-medium">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function buildPatientRecords(bookings: Booking[]): PatientRecord[] {
  const now = new Date();
  const grouped = new Map<string, Booking[]>();

  bookings
    .filter((booking) => new Date(booking.appointmentStartUtc) < now && booking.status !== 'cancelled')
    .forEach((booking) => {
      const email = booking.customerEmail.toLowerCase();
      grouped.set(email, [...(grouped.get(email) || []), booking]);
    });

  return [...grouped.entries()]
    .map(([email, visits]) => {
      const sortedVisits = [...visits].sort(
        (a, b) => new Date(b.appointmentStartUtc).getTime() - new Date(a.appointmentStartUtc).getTime(),
      );
      const lastVisit = sortedVisits[0];
      const upcoming = bookings
        .filter(
          (booking) =>
            booking.customerEmail.toLowerCase() === email &&
            booking.status === 'confirmed' &&
            new Date(booking.appointmentStartUtc) >= now,
        )
        .sort(
          (a, b) => new Date(a.appointmentStartUtc).getTime() - new Date(b.appointmentStartUtc).getTime(),
        );

      return {
        email,
        name: lastVisit.customerName,
        phone: lastVisit.customerPhone || '',
        visits: sortedVisits,
        upcoming,
        lastVisit,
        latestNotes: sortedVisits.find((visit) => visit.notes)?.notes || '',
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastVisit.appointmentStartUtc).getTime() -
        new Date(a.lastVisit.appointmentStartUtc).getTime(),
    );
}

function filterPatients(patients: PatientRecord[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return patients;
  }

  return patients.filter((patient) =>
    [patient.name, patient.email, patient.phone, patient.latestNotes]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized)),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
