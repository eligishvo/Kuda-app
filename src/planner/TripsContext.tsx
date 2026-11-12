// The saved trips, kept on the phone and shared between the trips list, a trip's screen and the screen
// where flights are chosen.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TripSelection } from '../../shared/types';
import { sanitizeTrip } from '../flights/flights';
import { airportByCode } from '../map/mapData';
import { KEYS, load, save } from '../storage/store';
import { newTrip, sanitizeTrips, Trip } from './trip';

type Value = {
  trips: Trip[];
  /** False until the saved trips have been read. */
  ready: boolean;
  /** Starts a trip from chosen flights and returns it. */
  add: (flights: TripSelection) => Trip;
  /** Changes one trip with a function of its previous state, and saves. */
  update: (id: string, change: (prev: Trip) => Trip) => void;
  remove: (id: string) => void;
};

const Ctx = createContext<Value | null>(null);

const placeOf = (flights: TripSelection) => {
  const a = airportByCode(flights.destination);
  return a?.city || a?.name || flights.destination;
};

export function TripsProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);
  // The latest list, for add(), which must return the new trip straight away
  const latest = useRef<Trip[]>([]);

  const store = useCallback((next: Trip[]) => {
    latest.current = next;
    setTrips(next);
    save(KEYS.trips, next);
  }, []);

  useEffect(() => {
    (async () => {
      let list = sanitizeTrips(await load<unknown>(KEYS.trips, null), sanitizeTrip);
      // Flights chosen with an earlier version of the app (one saved choice, no plan) become the first trip
      if (list.length === 0) {
        const old = sanitizeTrip(await load<unknown>(KEYS.trip, null));
        if (old) {
          list = [newTrip(old, placeOf(old), Date.now())];
          save(KEYS.trips, list);
        }
      }
      latest.current = list;
      setTrips(list);
      setReady(true);
    })();
  }, []);

  const add = useCallback(
    (flights: TripSelection) => {
      const trip = newTrip(flights, placeOf(flights), Date.now());
      store([trip, ...latest.current]);
      return trip;
    },
    [store],
  );
  const update = useCallback(
    (id: string, change: (prev: Trip) => Trip) => store(latest.current.map((t) => (t.id === id ? change(t) : t))),
    [store],
  );
  const remove = useCallback((id: string) => store(latest.current.filter((t) => t.id !== id)), [store]);

  const value = useMemo(() => ({ trips, ready, add, update, remove }), [trips, ready, add, update, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrips(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrips must be used inside TripsProvider');
  return v;
}
