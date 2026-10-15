import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { cssVar } from '../lib/theme'
import 'leaflet/dist/leaflet.css'

export type MapStop = {
  key: string
  title: string
  lat: number
  lng: number
  done: boolean
  next: boolean
  number: number
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions, { padding: [24, 24] })
  }, [map, positions])
  return null
}

export function StopRouteMap({ stops }: { stops: MapStop[] }) {
  if (stops.length === 0) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-sm text-lumi-muted">
        Sin coordenadas para el mapa
      </div>
    )
  }
  const line = stops.map((stop) => [stop.lat, stop.lng] as [number, number])
  const first = stops[0]
  return (
    <MapContainer
      center={[first.lat, first.lng]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: cssVar('--map-ink', '#1F2328'), weight: 4 }} />
      )}
      {stops.map((stop) => (
        <CircleMarker
          key={stop.key}
          center={[stop.lat, stop.lng]}
          radius={stop.next ? 10 : 7}
          pathOptions={{
            color: stop.next ? cssVar('--accent', '#4493F8') : cssVar('--map-ink', '#1F2328'),
            weight: 2,
            fillColor: stop.done
              ? cssVar('--surface-2', '#212830')
              : stop.next
                ? cssVar('--accent', '#4493F8')
                : '#FFFFFF',
            fillOpacity: 1,
          }}
        >
          <Tooltip>{`${stop.number}. ${stop.title}`}</Tooltip>
        </CircleMarker>
      ))}
      <FitBounds positions={line} />
    </MapContainer>
  )
}
