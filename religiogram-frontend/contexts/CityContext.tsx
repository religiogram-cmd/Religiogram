'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

interface CityContextType {
  city: string;
  setCity: (c: string) => void;
  lat: number | null;
  lng: number | null;
}

const CityContext = createContext<CityContextType>({
  city: 'Delhi',
  setCity: () => {},
  lat: 28.6139,
  lng: 77.2090,
});

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState('Delhi');
  return (
    <CityContext.Provider value={{ city, setCity, lat: 28.6139, lng: 77.2090 }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCityContext() {
  return useContext(CityContext);
}

export default CityContext;
