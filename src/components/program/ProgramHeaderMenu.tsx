import React from 'react';
import { FileSpreadsheet, Layers, Plus } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { OverflowMenu, OverflowMenuItem } from '../common/Header';

interface ProgramHeaderMenuProps {
  onOpenImportSpreadsheet: () => void;
  onOpenChangeProgram: () => void;
  onOpenCreateExercise?: () => void;
}

/**
 * 3-dots overflow menu for the Program page header (matches Workout & Progress headers):
 * opens actions to import a program from a spreadsheet, switch programs, or add a custom exercise.
 */
export const ProgramHeaderMenu: React.FC<ProgramHeaderMenuProps> = ({
  onOpenImportSpreadsheet,
  onOpenChangeProgram,
  onOpenCreateExercise,
}) => {
  const items: OverflowMenuItem[] = [
    {
      id: 'import',
      label: 'Import from spreadsheet',
      icon: <FileSpreadsheet className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        onOpenImportSpreadsheet();
      },
    },
    {
      id: 'change',
      label: 'Change program',
      icon: <Layers className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        onOpenChangeProgram();
      },
    },
  ];
  if (onOpenCreateExercise) {
    items.push({
      id: 'create-exercise',
      label: 'Add custom exercise',
      icon: <Plus className="w-4 h-4 stroke-[2]" aria-hidden="true" />,
      onSelect: () => {
        triggerHaptic('light');
        onOpenCreateExercise();
      },
    });
  }

  return (
    <div className="absolute right-0 top-1/2 -translate-y-1/2">
      <OverflowMenu
        triggerAriaLabel="Program options: import from spreadsheet and change program"
        menuAriaLabel="Program options"
        items={items}
      />
    </div>
  );
};
