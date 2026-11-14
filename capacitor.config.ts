import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // El id identifica la app en el teléfono: no se puede cambiar sin perder los datos instalados.
  appId: 'io.github.elgnocci.vagabond',
  appName: 'Vagabond',
  webDir: 'dist',
  backgroundColor: '#0b0d0d',
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_vagabond', iconColor: '#56D8C2' },
  },
}

export default config
