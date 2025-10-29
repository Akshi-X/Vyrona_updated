export const ALL_STAGES = [
  'Scheduled',
  'Apheresis',
  'Cryopreservation',
  'Transportation',
  'Reengineering',
  'Reinfusion',
  'AfterCare',
  'Failure',
];

export function getStageColor(stage?: string | null): string {
  if (!stage) {
    return 'bg-gray-100 text-gray-800';
  }

  const normalized = stage.toLowerCase();
  switch (normalized) {
    case 'scheduled':
    case 'apheresis':
    case 'cryopreservation':
    case 'transportation':
    case 'reengineering':
    case 'reinfusion':
      return 'bg-green-100 text-green-800';
    case 'aftercare':
    case 'after care':
      return 'bg-blue-100 text-blue-800';
    case 'failure':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}


