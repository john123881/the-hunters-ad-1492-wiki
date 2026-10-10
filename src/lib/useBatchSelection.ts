import { useCallback, useEffect, useMemo, useState } from 'react';

export function useBatchSelection<T extends string>(availableValues: readonly T[]) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<T[]>([]);
  const availableSet = useMemo(() => new Set(availableValues), [availableValues]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    setSelected(current => {
      const valid = current.filter(value => availableSet.has(value));
      return valid.length === current.length ? current : valid;
    });
  }, [availableSet]);

  const start = useCallback(() => {
    setSelected([]);
    setActive(true);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    setSelected([]);
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const selectAll = useCallback(() => {
    setSelected([...availableSet]);
  }, [availableSet]);

  const toggle = useCallback((value: T) => {
    if (!availableSet.has(value)) return;
    setSelected(current => current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value]);
  }, [availableSet]);

  const isSelected = useCallback((value: T) => selectedSet.has(value), [selectedSet]);

  return {
    active,
    selected,
    selectedCount: selected.length,
    start,
    cancel,
    clear,
    selectAll,
    toggle,
    isSelected,
  };
}
