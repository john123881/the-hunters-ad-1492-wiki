import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, LockKeyhole, MoreHorizontal, Move, PackageOpen, RotateCcw, Search, Trash2, Wrench } from 'lucide-react';
import { HAND_EQUIPMENT_VISUAL } from '../../shared/equipmentBoardTemplates';
import type { ApiErrorResponse, CampaignWagonResponse } from '../../shared/types';

type SlotStatus = 'OPEN' | 'LOCKED_10' | 'BLOCKED' | 'OCCUPIED';
type Slot = {
  slotKey: string;
  category: string; laneKey: string;
  rowIndex: number;
  boardRect: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
  initialStatus: 'OPEN' | 'LOCKED_10' | 'BLOCKED' | null;
  status: SlotStatus | null;
};
type EquipmentSocket = {
  weaponSlotIndex: number; socketIndex: number; connectorCode: string; connectorName: string;
  attachmentInstanceId: number | null;
};
type Equipment = {
  instanceId: number; itemId: number; name: string; imageUrl: string; categoryCode: string;
  slotCount: number; damageMarkers: number; notes: string; slotKeys: string[];
  attachments: Array<{ instanceId: number; name: string; imageUrl: string; weaponSlotIndex: number; socketIndex: number }>;
  sockets: EquipmentSocket[];
};
type InstalledAttachment = {
  instanceId: number; name: string; imageUrl: string; weaponSlotIndex: number; socketIndex: number;
  weaponInstanceId: number; weaponName: string;
};
type RetainedAttachment = {
  instanceId: number; name: string; imageUrl: string; anchorSlotKey: string; socketIndex: number;
  damageMarkers: number; notes: string;
};
type Loadout = {
  playerNumber: number; characterId: number; heroSlug: string; version: number;
  templateVerified: boolean; slots: Slot[]; openedSlotKeys: string[];
  equipment: Equipment[]; retainedAttachments: RetainedAttachment[];
};
type Candidate = {
  instanceId: number; itemId: number; name: string; imageUrl: string; categoryName: string;
  slotCount: number; damageMarkers: number; notes: string; previewSlotKeys: string[];
};
type CandidateResponse = { data: { slotKey: string; items: Candidate[] } };
type CatalogCandidate = {
  itemId: number; name: string; imageUrl: string; categoryName: string;
  slotCount: number; previewSlotKeys: string[];
};
type CatalogCandidateResponse = { data: { slotKey: string; items: CatalogCandidate[] } };
type AttachmentCandidate = {
  instanceId: number; itemId: number; name: string; imageUrl: string; notes: string;
  damageMarkers: number; connectorCode: string; connectorName: string;
};
type AttachmentCatalogCandidate = {
  itemId: number; name: string; imageUrl: string; connectorCode: string; connectorName: string;
};
type AttachmentCatalogCandidateResponse = {
  data: { weaponInstanceId: number; weaponSlotIndex: number; socketIndex: number; items: AttachmentCatalogCandidate[] };
};
type AttachmentCandidateResponse = {
  data: {
    weaponInstanceId: number; weaponSlotIndex: number; socketIndex: number;
    connector: { code: string; name: string }; items: AttachmentCandidate[];
  };
};
type AttachmentTarget = { equipment: Equipment; socket: EquipmentSocket };
type LoadoutResponse = { data: Loadout };

const EQUIPMENT_BOARD_IMAGE_URL = '/images/campaign/characters/equipment-board-gridless-v3.png';
const EQUIPMENT_COVER_IMAGE_URLS = [
  '/images/campaign/characters/slot-cover-blocked-x-v1.png',
  '/images/campaign/characters/slot-cover-10xp-v1.png',
] as const;

async function preloadEquipmentImage(url: string) {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('圖片載入失敗：' + url));
  });
  image.src = url;
  if (!image.complete || image.naturalWidth === 0) await loaded;
  if (typeof image.decode === 'function') await image.decode();
}

class EquipmentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly conflict?: unknown,
  ) {
    super(message);
    this.name = 'EquipmentApiError';
  }
}

async function readJson<T extends object>(response: Response): Promise<T> {
  const payload = await response.json() as T | ApiErrorResponse;
  if (!response.ok || (typeof payload === 'object' && payload !== null && 'error' in payload)) {
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const detail = payload.error as ApiErrorResponse['error'] & { conflict?: unknown };
      throw new EquipmentApiError(detail.message, response.status, detail.code, detail.conflict);
    }
    throw new EquipmentApiError('操作失敗，請稍後再試。', response.status, 'UNKNOWN_ERROR');
  }
  return payload as T;
}

export function CharacterEquipmentBoard({ playerNumber, heroSlug, canEdit, onVersionChange }: {
  playerNumber: number;
  heroSlug: string;
  canEdit: boolean;
  onVersionChange: (version: number) => void;
}) {
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [wagonVersion, setWagonVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [visualStatus, setVisualStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [visualRetry, setVisualRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [pickerSource, setPickerSource] = useState<'WAGON' | 'CATALOG'>('WAGON');
  const [catalogCandidates, setCatalogCandidates] = useState<CatalogCandidate[]>([]);
  const [catalogPreview, setCatalogPreview] = useState<CatalogCandidate | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<Equipment | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [movingEquipment, setMovingEquipment] = useState<Equipment | null>(null);
  const [moveStartSlot, setMoveStartSlot] = useState<string | null>(null);
  const [selectedRetainedAttachment, setSelectedRetainedAttachment] = useState<RetainedAttachment | null>(null);
  const [selectedInstalledAttachment, setSelectedInstalledAttachment] = useState<InstalledAttachment | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [attachmentTarget, setAttachmentTarget] = useState<AttachmentTarget | null>(null);
  const [attachmentCandidates, setAttachmentCandidates] = useState<AttachmentCandidate[]>([]);
  const [selectedAttachmentCandidate, setSelectedAttachmentCandidate] = useState<AttachmentCandidate | null>(null);
  const [attachmentSource, setAttachmentSource] = useState<'WAGON' | 'CATALOG'>('WAGON');
  const [attachmentCatalogCandidates, setAttachmentCatalogCandidates] = useState<AttachmentCatalogCandidate[]>([]);
  const [selectedAttachmentCatalogCandidate, setSelectedAttachmentCatalogCandidate] = useState<AttachmentCatalogCandidate | null>(null);
  const [attachmentQuery, setAttachmentQuery] = useState('');
  const previousHeroSlug = useRef(heroSlug);
  const dialogPreviousFocus = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [loadoutPayload, wagonPayload] = await Promise.all([
        fetch('/api/campaign/characters/' + playerNumber + '/loadout', { credentials: 'same-origin' }).then(response => readJson<LoadoutResponse>(response)),
        fetch('/api/campaign/wagon', { credentials: 'same-origin' }).then(response => readJson<CampaignWagonResponse>(response)),
      ]);
      setLoadout(loadoutPayload.data);
      setWagonVersion(wagonPayload.data.version);
      onVersionChange(loadoutPayload.data.version);
      setMessage('');
      return loadoutPayload.data;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '裝備面板載入失敗。');
      return null;
    } finally {
      setLoading(false);
    }
  }, [onVersionChange, playerNumber]);

  useEffect(() => { void refresh(); }, [refresh]);

  const equipmentVisualUrls = useMemo(() => {
    if (!loadout?.templateVerified) return [];
    return [...new Set([
      EQUIPMENT_BOARD_IMAGE_URL,
      ...EQUIPMENT_COVER_IMAGE_URLS,
      ...loadout.equipment.flatMap(item => [
        item.imageUrl,
        ...item.attachments.map(attachment => attachment.imageUrl),
      ]),
      ...loadout.retainedAttachments.map(item => item.imageUrl),
    ].filter(Boolean))];
  }, [loadout]);

  useEffect(() => {
    if (!equipmentVisualUrls.length) return;
    let cancelled = false;
    setVisualStatus('loading');
    void Promise.all(equipmentVisualUrls.map(preloadEquipmentImage))
      .then(() => { if (!cancelled) setVisualStatus('ready'); })
      .catch(() => { if (!cancelled) setVisualStatus('error'); });
    return () => { cancelled = true; };
  }, [equipmentVisualUrls, visualRetry]);

  useEffect(() => {
    if (previousHeroSlug.current === heroSlug) return;
    previousHeroSlug.current = heroSlug;
    setSelectedSlot(null);
    setCandidates([]);
    setPreview(null);
    setCatalogCandidates([]);
    setCatalogPreview(null);
    setPickerSource('WAGON');
    setReplacementTarget(null);
    setSelectedEquipment(null);
    setMovingEquipment(null);
    setMoveStartSlot(null);
    setSelectedRetainedAttachment(null);
    setSelectedInstalledAttachment(null);
    setAttachmentTarget(null);
    setAttachmentCandidates([]);
    setSelectedAttachmentCandidate(null);
    setMoreActionsOpen(false);
    void refresh().then(() => {
      setMessage('角色已更換，請重新選擇裝備位置。');
    });
  }, [heroSlug, refresh]);

  const dialogOpen = Boolean(selectedSlot || selectedEquipment || selectedRetainedAttachment || selectedInstalledAttachment || attachmentTarget);
  useEffect(() => {
    if (!dialogOpen) return;
    dialogPreviousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const dialog = document.querySelector<HTMLElement>('.equipment-drawer-backdrop [role="dialog"]');
      dialog?.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = document.querySelector<HTMLElement>('.equipment-drawer-backdrop [role="dialog"]');
      if (event.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        )].filter(element => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelectedSlot(null);
      setCandidates([]);
      setPreview(null);
      setReplacementTarget(null);
      setSelectedEquipment(null);
      setSelectedRetainedAttachment(null);
      setSelectedInstalledAttachment(null);
      setAttachmentTarget(null);
      setAttachmentCandidates([]);
      setSelectedAttachmentCandidate(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      dialogPreviousFocus.current?.focus();
    };
  }, [dialogOpen]);

  async function mutate(url: string, method: string, body: Record<string, unknown>) {
    if (!loadout) return null;
    setBusy(true);
    try {
      const payload = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, expectedCharacterVersion: loadout.version }),
      }).then(response => readJson<LoadoutResponse>(response));
      setLoadout(payload.data);
      onVersionChange(payload.data.version);
      setMessage('裝備面板已更新。');
      return payload.data;
    } catch (cause) {
      const isVersionConflict = cause instanceof EquipmentApiError && cause.status === 409 && (
        cause.code.includes('VERSION_CONFLICT') || cause.code === 'EQUIPMENT_VERSION_CONFLICT'
      );
      const latest = await refresh();
      if (isVersionConflict && latest) {
        if (latest.heroSlug !== loadout.heroSlug) {
          closePicker();
          closeAttachmentPicker();
          setSelectedEquipment(null);
          setSelectedRetainedAttachment(null);
          setMovingEquipment(null);
          setMoveStartSlot(null);
          setMessage('角色已更換，請重新選擇裝備位置。');
          return null;
        }

        if (movingEquipment) {
          const current = latest.equipment.find(item => item.instanceId === movingEquipment.instanceId);
          if (current) {
            setMovingEquipment(current);
            if (moveStartSlot) {
              const target = latest.slots.find(slot => slot.slotKey === moveStartSlot);
              const occupiedByCurrent = current.slotKeys.includes(moveStartSlot);
              if (!target || (target.status !== 'OPEN' && !occupiedByCurrent)) {
                setMoveStartSlot(null);
                setMessage('資料已更新；原位置已無法使用，已保留物品，請重新選擇空格。');
                return null;
              }
            }
          } else {
            setMovingEquipment(null);
            setMoveStartSlot(null);
            setMessage('資料已更新；這件角色裝備已被移動，請重新操作。');
            return null;
          }
        }
        if (selectedEquipment) {
          setSelectedEquipment(latest.equipment.find(item => item.instanceId === selectedEquipment.instanceId) ?? null);
        }
        if (selectedRetainedAttachment) {
          setSelectedRetainedAttachment(
            latest.retainedAttachments.find(item => item.instanceId === selectedRetainedAttachment.instanceId) ?? null,
          );
        }
        if (selectedInstalledAttachment) {
          const weapon = latest.equipment.find(item => item.instanceId === selectedInstalledAttachment.weaponInstanceId);
          const attachment = weapon?.attachments.find(item => item.instanceId === selectedInstalledAttachment.instanceId);
          setSelectedInstalledAttachment(weapon && attachment ? {
            ...attachment,
            weaponInstanceId: weapon.instanceId,
            weaponName: weapon.name,
          } : null);
        }

        if (selectedSlot && preview) {
          const query = new URLSearchParams({ slotKey: selectedSlot });
          if (replacementTarget) query.set('replaceInstanceId', String(replacementTarget.instanceId));
          try {
            const currentCandidates = await fetch(
              '/api/campaign/characters/' + playerNumber + '/equipment-candidates?' + query,
              { credentials: 'same-origin' },
            ).then(response => readJson<CandidateResponse>(response));
            setCandidates(currentCandidates.data.items);
            const currentPreview = currentCandidates.data.items.find(item => item.instanceId === preview.instanceId) ?? null;
            setPreview(currentPreview);
            if (!currentPreview) {
              setMessage('資料已更新；原物品已不在馬車，已保留起始格，請重新選擇裝備。');
              return null;
            }
          } catch {
            setPreview(null);
          }
        }

        if (selectedSlot && catalogPreview) {
          const query = new URLSearchParams({ slotKey: selectedSlot });
          if (replacementTarget) query.set('replaceInstanceId', String(replacementTarget.instanceId));
          try {
            const currentCandidates = await fetch(
              '/api/campaign/characters/' + playerNumber + '/equipment-catalog-candidates?' + query,
              { credentials: 'same-origin' },
            ).then(response => readJson<CatalogCandidateResponse>(response));
            setCatalogCandidates(currentCandidates.data.items);
            const currentPreview = currentCandidates.data.items.find(item => item.itemId === catalogPreview.itemId) ?? null;
            setCatalogPreview(currentPreview);
            if (!currentPreview) {
              setSelectedSlot(null);
              setMessage('資料已更新；原位置已無法放置這件物品，請重新選擇裝備位置。');
              return null;
            }
          } catch {
            setCatalogPreview(null);
            setSelectedSlot(null);
            setMessage('資料已更新；原位置已失效，請重新選擇裝備位置。');
            return null;
          }
        }

        if (attachmentTarget) {
          const currentEquipment = latest.equipment.find(item => item.instanceId === attachmentTarget.equipment.instanceId);
          const currentSocket = currentEquipment?.sockets.find(socket =>
            socket.weaponSlotIndex === attachmentTarget.socket.weaponSlotIndex &&
            socket.socketIndex === attachmentTarget.socket.socketIndex &&
            socket.attachmentInstanceId == null
          );
          if (!currentEquipment || !currentSocket) {
            closeAttachmentPicker();
            setMessage('資料已更新；原附件孔位已失效或被占用，請重新選擇孔位。');
            return null;
          }
          setAttachmentTarget({ equipment: currentEquipment, socket: currentSocket });
          const query = new URLSearchParams({
            weaponSlotIndex: String(currentSocket.weaponSlotIndex),
            socketIndex: String(currentSocket.socketIndex),
          });
          if (attachmentSource === 'CATALOG') {
            const payload = await fetch(
              '/api/campaign/characters/' + playerNumber + '/equipment/' + currentEquipment.instanceId + '/attachment-catalog-candidates?' + query,
              { credentials: 'same-origin' },
            ).then(response => readJson<AttachmentCatalogCandidateResponse>(response));
            setAttachmentCatalogCandidates(payload.data.items);
            setSelectedAttachmentCatalogCandidate(previous =>
              previous ? payload.data.items.find(item => item.itemId === previous.itemId) ?? null : null
            );
          } else {
            const payload = await fetch(
              '/api/campaign/characters/' + playerNumber + '/equipment/' + currentEquipment.instanceId + '/attachment-candidates?' + query,
              { credentials: 'same-origin' },
            ).then(response => readJson<AttachmentCandidateResponse>(response));
            setAttachmentCandidates(payload.data.items);
            setSelectedAttachmentCandidate(previous =>
              previous ? payload.data.items.find(item => item.instanceId === previous.instanceId) ?? null : null
            );
          }
        }

        setMessage('角色或馬車資料已被其他玩家更新。已重新驗證並保留操作內容，請檢查預覽後再次確認。');
      } else {
        setMessage(cause instanceof Error ? cause.message : '裝備操作失敗。');
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function chooseSlot(slot: Slot) {
    if (!canEdit || busy || !loadout) return;
    if (movingEquipment) {
      const occupiedByMovingItem = movingEquipment.slotKeys.includes(slot.slotKey);
      if (slot.status !== 'OPEN' && !occupiedByMovingItem) {
        setMessage('這個位置目前無法放置，請選擇空格。');
        return;
      }
      setMoveStartSlot(slot.slotKey);
      setMessage('');
      return;
    }
    if (slot.status === 'BLOCKED') return;
    if (slot.category === 'ATTACHMENT') {
      if (slot.status !== 'OPEN') return;
      const handSlotKey = 'HAND_' + slot.rowIndex;
      const equipment = loadout.equipment.find(entry => entry.slotKeys.includes(handSlotKey));
      if (!equipment) {
        setMessage('這一列目前沒有可安裝附件的武器。');
        return;
      }
      const weaponSlotIndex = equipment.slotKeys.indexOf(handSlotKey) + 1;
      const openSockets = equipment.sockets.filter(socket =>
        socket.weaponSlotIndex === weaponSlotIndex && socket.attachmentInstanceId == null
      );
      if (openSockets.length === 1) {
        await openAttachmentPicker(equipment, openSockets[0]);
      } else {
        setSelectedEquipment(equipment);
        setMessage(openSockets.length ? '請選擇要安裝附件的孔位。' : '這一列的武器沒有可用附件孔位。');
      }
      return;
    }
    if (slot.status === 'LOCKED_10') {
      if (!window.confirm('確認已自行調整角色 XP，並移除這個 10 XP 蓋板？')) return;
      await mutate('/api/campaign/characters/' + playerNumber + '/slots/' + slot.slotKey + '/open', 'POST', {
        confirmedManualXpAdjustment: true,
      });
      return;
    }
    if (slot.status === 'OCCUPIED') {
      const item = loadout.equipment.find(entry => entry.slotKeys.includes(slot.slotKey));
      if (item) setSelectedEquipment(item);
      return;
    }
    setBusy(true);
    try {
      const payload = await fetch(
        '/api/campaign/characters/' + playerNumber + '/equipment-candidates?slotKey=' + encodeURIComponent(slot.slotKey),
        { credentials: 'same-origin' },
      ).then(response => readJson<CandidateResponse>(response));
      setSelectedSlot(slot.slotKey);
      setPickerSource('WAGON');
      setCandidates(payload.data.items);
      setCatalogCandidates([]);
      setCandidateQuery('');
      setPreview(null);
      setCatalogPreview(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '無法載入馬車裝備。');
    } finally {
      setBusy(false);
    }
  }

  async function openReplacementPicker(item: Equipment) {
    if (!item.slotKeys[0]) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({
        slotKey: item.slotKeys[0],
        replaceInstanceId: String(item.instanceId),
      });
      const payload = await fetch(
        '/api/campaign/characters/' + playerNumber + '/equipment-candidates?' + query,
        { credentials: 'same-origin' },
      ).then(response => readJson<CandidateResponse>(response));
      setReplacementTarget(item);
      setSelectedSlot(item.slotKeys[0]);
      setCandidates(payload.data.items);
      setCandidateQuery('');
      setPreview(null);
      setSelectedEquipment(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '無法載入可更換的馬車裝備。');
    } finally {
      setBusy(false);
    }
  }

  function closePicker() {
    setSelectedSlot(null);
    setPreview(null);
    setCatalogPreview(null);
    setCandidates([]);
    setCatalogCandidates([]);
    setPickerSource('WAGON');
    setReplacementTarget(null);
  }

  async function changePickerSource(source: 'WAGON' | 'CATALOG') {
    if (!selectedSlot || source === pickerSource) return;
    setPickerSource(source);
    setCandidateQuery('');
    setPreview(null);
    setCatalogPreview(null);
    if (source === 'WAGON') return;
    if (catalogCandidates.length) return;
    setBusy(true);
    try {
      const payload = await fetch(
        '/api/campaign/characters/' + playerNumber + '/equipment-catalog-candidates?' + new URLSearchParams({
          slotKey: selectedSlot,
          ...(replacementTarget ? { replaceInstanceId: String(replacementTarget.instanceId) } : {}),
        }),
        { credentials: 'same-origin' },
      ).then(response => readJson<CatalogCandidateResponse>(response));
      setCatalogCandidates(payload.data.items);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '無法載入物品圖鑑。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCatalogEquip() {
    if (!catalogPreview || !selectedSlot) return;
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/equipment-from-catalog',
      'POST',
      {
        itemId: catalogPreview.itemId,
        startSlotKey: selectedSlot,
        ...(replacementTarget && wagonVersion != null ? {
          replaceInstanceId: replacementTarget.instanceId,
          expectedWagonVersion: wagonVersion,
        } : {}),
      },
    );
    if (updated) {
      closePicker();
      await refresh();
    }
  }

  async function confirmEquip() {
    if (!loadout || !preview || !selectedSlot || wagonVersion == null) return;
    const replacing = replacementTarget;
    const updated = replacing
      ? await mutate(
        '/api/campaign/characters/' + playerNumber + '/equipment/' + replacing.instanceId + '/replace',
        'POST',
        { newInstanceId: preview.instanceId, startSlotKey: selectedSlot, expectedWagonVersion: wagonVersion },
      )
      : await mutate(
        '/api/campaign/characters/' + playerNumber + '/equipment/' + preview.instanceId,
        'PUT',
        { startSlotKey: selectedSlot, expectedWagonVersion: wagonVersion },
      );
    if (updated) {
      closePicker();
      await refresh();
    }
  }

  async function confirmMove() {
    if (!movingEquipment || !moveStartSlot) return;
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/equipment/' + movingEquipment.instanceId + '/position',
      'PATCH',
      { startSlotKey: moveStartSlot },
    );
    if (updated) {
      setMovingEquipment(null);
      setMoveStartSlot(null);
      await refresh();
    }
  }

  function cancelMove() {
    setMovingEquipment(null);
    setMoveStartSlot(null);
  }

  async function openAttachmentPicker(equipment: Equipment, socket: EquipmentSocket) {
    setBusy(true);
    try {
      const query = new URLSearchParams({
        weaponSlotIndex: String(socket.weaponSlotIndex),
        socketIndex: String(socket.socketIndex),
      });
      const payload = await fetch(
        '/api/campaign/characters/' + playerNumber + '/equipment/' + equipment.instanceId + '/attachment-candidates?' + query,
        { credentials: 'same-origin' },
      ).then(response => readJson<AttachmentCandidateResponse>(response));
      setAttachmentTarget({ equipment, socket });
      setAttachmentSource('WAGON');
      setAttachmentCandidates(payload.data.items);
      setAttachmentCatalogCandidates([]);
      setSelectedAttachmentCatalogCandidate(null);
      setSelectedAttachmentCandidate(null);
      setAttachmentQuery('');
      setSelectedEquipment(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '無法載入相容附件。');
    } finally {
      setBusy(false);
    }
  }

  function closeAttachmentPicker() {
    setAttachmentTarget(null);
    setAttachmentCandidates([]);
    setSelectedAttachmentCandidate(null);
    setAttachmentCatalogCandidates([]);
    setSelectedAttachmentCatalogCandidate(null);
    setAttachmentSource('WAGON');
    setAttachmentQuery('');
  }

  async function changeAttachmentSource(source: 'WAGON' | 'CATALOG') {
    if (!attachmentTarget || source === attachmentSource) return;
    setAttachmentSource(source);
    setAttachmentQuery('');
    setSelectedAttachmentCandidate(null);
    setSelectedAttachmentCatalogCandidate(null);
    if (source === 'WAGON' || attachmentCatalogCandidates.length) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({
        weaponSlotIndex: String(attachmentTarget.socket.weaponSlotIndex),
        socketIndex: String(attachmentTarget.socket.socketIndex),
      });
      const payload = await fetch(
        '/api/campaign/characters/' + playerNumber + '/equipment/' + attachmentTarget.equipment.instanceId + '/attachment-catalog-candidates?' + query,
        { credentials: 'same-origin' },
      ).then(response => readJson<AttachmentCatalogCandidateResponse>(response));
      setAttachmentCatalogCandidates(payload.data.items);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '無法載入附件列表。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCatalogAttachmentInstall() {
    if (!attachmentTarget || !selectedAttachmentCatalogCandidate) return;
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/equipment/' + attachmentTarget.equipment.instanceId + '/attachments-from-catalog',
      'POST',
      {
        itemId: selectedAttachmentCatalogCandidate.itemId,
        weaponSlotIndex: attachmentTarget.socket.weaponSlotIndex,
        socketIndex: attachmentTarget.socket.socketIndex,
      },
    );
    if (updated) {
      closeAttachmentPicker();
      await refresh();
    }
  }

  async function confirmAttachmentInstall() {
    if (!attachmentTarget || !selectedAttachmentCandidate || wagonVersion == null) return;
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/equipment/' + attachmentTarget.equipment.instanceId + '/attachments',
      'POST',
      {
        attachmentInstanceId: selectedAttachmentCandidate.instanceId,
        weaponSlotIndex: attachmentTarget.socket.weaponSlotIndex,
        socketIndex: attachmentTarget.socket.socketIndex,
        expectedWagonVersion: wagonVersion,
      },
    );
    if (updated) {
      closeAttachmentPicker();
      await refresh();
    }
  }

  async function installedAttachmentAction(action: 'wagon' | 'remove') {
    if (!selectedInstalledAttachment || wagonVersion == null) return;
    if (action === 'remove' && !window.confirm(
      selectedInstalledAttachment.name + ' #' + selectedInstalledAttachment.instanceId + ' 將永久移除，不會移入馬車。確定繼續？',
    )) return;
    const suffix = action === 'wagon' ? 'move-to-wagon' : 'remove';
    const body = action === 'wagon' ? { expectedWagonVersion: wagonVersion } : { confirmed: true };
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/equipment/' +
        selectedInstalledAttachment.weaponInstanceId + '/attachments/' +
        selectedInstalledAttachment.instanceId + '/' + suffix,
      'POST',
      body,
    );
    if (updated) {
      setSelectedInstalledAttachment(null);
      await refresh();
    }
  }

  async function retainedAttachmentAction(action: 'wagon' | 'remove') {
    if (!selectedRetainedAttachment || wagonVersion == null) return;
    if (action === 'remove' && !window.confirm(
      selectedRetainedAttachment.name + ' #' + selectedRetainedAttachment.instanceId + ' 將永久移除，不會移入馬車。確定繼續？',
    )) return;
    const suffix = action === 'wagon' ? 'move-to-wagon' : 'remove';
    const body = action === 'wagon' ? { expectedWagonVersion: wagonVersion } : { confirmed: true };
    const updated = await mutate(
      '/api/campaign/characters/' + playerNumber + '/attachments/' + selectedRetainedAttachment.instanceId + '/' + suffix,
      'POST',
      body,
    );
    if (updated) {
      setSelectedRetainedAttachment(null);
      await refresh();
    }
  }

  async function equipmentAction(action: 'wagon' | 'remove' | 'damage') {
    if (!selectedEquipment || wagonVersion == null) return;
    let updated: Loadout | null = null;
    if (action === 'wagon') {
      updated = await mutate('/api/campaign/characters/' + playerNumber + '/equipment/' + selectedEquipment.instanceId + '/unequip', 'POST', {
        expectedWagonVersion: wagonVersion,
      });
    } else if (action === 'remove') {
      if (!window.confirm(selectedEquipment.name + ' #' + selectedEquipment.instanceId + ' 將永久移除，不會移入馬車。確定繼續？')) return;
      updated = await mutate('/api/campaign/characters/' + playerNumber + '/equipment/' + selectedEquipment.instanceId + '/remove', 'POST', {
        confirmed: true,
      });
    } else {
      updated = await mutate('/api/campaign/characters/' + playerNumber + '/equipment/' + selectedEquipment.instanceId + '/damage', 'PATCH', {
        damageMarkers: selectedEquipment.damageMarkers ? 0 : 1,
      });
    }
    if (updated) {
      setSelectedEquipment(null);
      await refresh();
    }
  }

  async function restoreInitialBoard() {
    if (!loadout?.openedSlotKeys.length) return;
    if (!window.confirm(
      '確定復原這位角色的初始面板？所有已開啟的 10 XP 蓋板都會放回；X 蓋板維持英雄原始配置。',
    )) return;
    setMoreActionsOpen(false);
    await mutate(
      '/api/campaign/characters/' + playerNumber + '/loadout/restore-initial',
      'POST',
      { confirmed: true },
    );
  }

  async function toggleCover(slotKey: string) {
    if (!window.confirm('確定放回這個 10 XP 蓋板？')) return;
    await mutate('/api/campaign/characters/' + playerNumber + '/slots/' + slotKey + '/cover', 'POST', { confirmed: true });
  }

  async function reorder(item: Equipment, direction: -1 | 1) {
    if (!loadout) return;
    const hand = loadout.equipment
      .filter(entry => entry.slotKeys.some(key => key.startsWith('HAND_')))
      .sort((a, b) => Number(a.slotKeys[0].split('_')[1]) - Number(b.slotKeys[0].split('_')[1]));
    const index = hand.findIndex(entry => entry.instanceId === item.instanceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= hand.length) return;
    const ids = hand.map(entry => entry.instanceId);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await mutate('/api/campaign/characters/' + playerNumber + '/loadout/hand-order', 'PUT', { orderedInstanceIds: ids });
  }

  const filteredCandidates = useMemo(() => {
    const query = candidateQuery.trim().toLocaleLowerCase();
    if (!query) return candidates;
    const normalizedId = query.replace(/^#/, '');
    return candidates.filter(item =>
      item.name.toLocaleLowerCase().includes(query) || String(item.instanceId) === normalizedId
    );
  }, [candidateQuery, candidates]);

  const filteredCatalogCandidates = useMemo(() => {
    const query = candidateQuery.trim().toLocaleLowerCase();
    if (!query) return catalogCandidates;
    return catalogCandidates.filter(item =>
      item.name.toLocaleLowerCase().includes(query) || String(item.itemId) === query.replace(/^#/, '')
    );
  }, [candidateQuery, catalogCandidates]);

  const filteredAttachmentCandidates = useMemo(() => {
    const query = attachmentQuery.trim().toLocaleLowerCase();
    if (!query) return attachmentCandidates;
    const normalizedId = query.replace(/^#/, '');
    return attachmentCandidates.filter(item =>
      item.name.toLocaleLowerCase().includes(query) || String(item.instanceId) === normalizedId
    );
  }, [attachmentCandidates, attachmentQuery]);

  const filteredAttachmentCatalogCandidates = useMemo(() => {
    const query = attachmentQuery.trim().toLocaleLowerCase();
    if (!query) return attachmentCatalogCandidates;
    const normalizedId = query.replace(/^#/, '');
    return attachmentCatalogCandidates.filter(item =>
      item.name.toLocaleLowerCase().includes(query) || String(item.itemId) === normalizedId
    );
  }, [attachmentCatalogCandidates, attachmentQuery]);

  if (loading) return <section className="equipment-board-section"><div className="equipment-board-loading" role="status" aria-live="polite" aria-busy="true"><Loader2 className="spinning-icon" /><strong>載入裝備資料中…</strong></div></section>;
  if (!loadout) return <section className="equipment-board-section"><p className="character-notice">{message || '無法載入裝備面板。'}</p></section>;
  if (!loadout.templateVerified) return <section className="equipment-board-section"><p className="character-notice">這位英雄的裝備格配置尚未完成</p></section>;

  const movingStart = moveStartSlot ? loadout.slots.find(slot => slot.slotKey === moveStartSlot) : null;
  const movingPreview = movingStart && movingEquipment
    ? loadout.slots
      .filter(slot => slot.laneKey === movingStart.laneKey && slot.rowIndex >= movingStart.rowIndex && slot.rowIndex < movingStart.rowIndex + movingEquipment.slotCount)
      .map(slot => slot.slotKey)
    : [];
  const previewKeys = new Set([
    ...(preview?.previewSlotKeys ?? []),
    ...(catalogPreview?.previewSlotKeys ?? []),
    ...movingPreview,
  ]);
  return <section className="equipment-board-section" aria-labelledby="equipment-board-title">
    <header>
      <div><p className="eyebrow">EQUIPMENT BOARD</p><h2 id="equipment-board-title">裝備面板</h2><p>點選空格，從馬車或物品列表選擇可放置的物品。</p></div>
      <div className="equipment-board-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={() => void refresh()}><RotateCcw />重新載入</button>
        {canEdit && <div className="equipment-more-actions">
          <button className="button secondary" type="button" aria-haspopup="menu" aria-expanded={moreActionsOpen} onClick={() => setMoreActionsOpen(value => !value)}><MoreHorizontal />更多操作</button>
          {moreActionsOpen && <div className="equipment-more-menu" role="menu">
            <button className="button secondary" role="menuitem" type="button" disabled={busy || !loadout.openedSlotKeys.length} onClick={() => void restoreInitialBoard()}>
              <RotateCcw />復原角色初始面板
            </button>
            <button className="button danger" role="menuitem" type="button" disabled={busy || (!loadout.equipment.length && !loadout.retainedAttachments.length)} onClick={async () => {
              const items = [...loadout.equipment, ...loadout.retainedAttachments];
              const list = items.map(item => '• ' + item.name + ' #' + item.instanceId).join('\n');
              if (!window.confirm('將永久移除角色面板上的 ' + items.length + ' 件物品：\n\n' + list + '\n\n不會移入馬車，也無法復原。確定繼續？')) return;
              setMoreActionsOpen(false);
              await mutate('/api/campaign/characters/' + playerNumber + '/equipment/remove-all', 'POST', { confirmed: true });
            }}><Trash2 />全部移除</button>
          </div>}
        </div>}
      </div>
    </header>
    {message && <div className={message.includes('已更新') ? 'character-notice success' : 'character-notice'} role="status">{message}</div>}
    {movingEquipment && <div className="equipment-move-bar" role="status">
      <span><Move />正在移動 {movingEquipment.name} #{movingEquipment.instanceId}：請選擇新的起始格。</span>
      <div>
        <button className="button secondary" type="button" onClick={cancelMove}>取消</button>
        <button className="button" type="button" disabled={!moveStartSlot || busy} onClick={() => void confirmMove()}>確認位置</button>
      </div>
    </div>}
    <div className={'equipment-board-canvas' + (visualStatus === 'ready' ? ' equipment-board-ready' : '')} aria-busy={visualStatus === 'loading'}>
      {visualStatus === 'loading' && <div className="equipment-board-visual-state" role="status" aria-live="polite"><Loader2 className="spinning-icon" /><strong>載入裝備面板圖片中…</strong><small>正在準備底板、蓋板與裝備卡</small></div>}
      {visualStatus === 'error' && <div className="equipment-board-visual-state error" role="alert"><strong>裝備面板圖片載入失敗</strong><small>請檢查網路後重新嘗試</small><button className="button secondary" type="button" onClick={() => setVisualRetry(value => value + 1)}><RotateCcw />重試</button></div>}
      <img src={EQUIPMENT_BOARD_IMAGE_URL} alt="角色裝備面板" />
      {loadout.slots.map(slot => {
        if (slot.status === 'OCCUPIED') return null;
        return <button
          key={slot.slotKey}
          type="button"
          className={'equipment-slot status-' + String(slot.status).toLowerCase() + (previewKeys.has(slot.slotKey) ? ' preview' : '')}
          style={{
            left: slot.boardRect.xPercent + '%', top: slot.boardRect.yPercent + '%',
            width: slot.boardRect.widthPercent + '%', height: slot.boardRect.heightPercent + '%',
          }}
          disabled={!canEdit || busy || slot.status === 'BLOCKED'}
          onClick={() => void chooseSlot(slot)}
          aria-label={slot.slotKey + '，' + slot.status}
        >
          {slot.status === 'BLOCKED' && <img className="equipment-slot-cover" src="/images/campaign/characters/slot-cover-blocked-x-v1.png" alt="永久 X 蓋板" />}
          {slot.status === 'LOCKED_10' && <img className="equipment-slot-cover" src="/images/campaign/characters/slot-cover-10xp-v1.png" alt="10 XP 蓋板" />}
          {slot.status === 'OPEN' && <span className="equipment-slot-add">＋</span>}
        </button>;
      })}
      {loadout.equipment.map(item => {
        const first = loadout.slots.find(slot => slot.slotKey === item.slotKeys[0]);
        const last = loadout.slots.find(slot => slot.slotKey === item.slotKeys[item.slotKeys.length - 1]);
        if (!first || !last) return null;
        const hasSockets = (item.sockets?.length ?? 0) > 0;
        const isOverhangingWeapon = first.category === 'HAND' && item.categoryCode === 'weapon' && hasSockets;
        const overhang = isOverhangingWeapon ? HAND_EQUIPMENT_VISUAL.socketOverhangPercent : 0;
        return <button key={item.instanceId} type="button" className={'placed-equipment' + (isOverhangingWeapon ? ' hand-weapon' : '')} style={{
          left: (first.boardRect.xPercent - overhang) + '%', top: first.boardRect.yPercent + '%',
          width: (first.boardRect.widthPercent + overhang) + '%',
          height: (last.boardRect.yPercent + last.boardRect.heightPercent - first.boardRect.yPercent) + '%',
        }} onClick={() => {
          if (!movingEquipment) setSelectedEquipment(item);
        }}
          title={item.name + ' #' + item.instanceId}
          aria-label={item.name + ' #' + item.instanceId + (item.damageMarkers ? '，有毀損標記' : '')}>
          {item.imageUrl && <img src={item.imageUrl} alt="" />}
        </button>;
      })}
      {loadout.equipment.flatMap(equipment => equipment.attachments.map(item => {
        const handSlotKey = equipment.slotKeys[item.weaponSlotIndex - 1];
        const handRow = handSlotKey?.startsWith('HAND_') ? Number(handSlotKey.split('_')[1]) : null;
        const slot = handRow ? loadout.slots.find(entry => entry.slotKey === 'ATTACHMENT_' + handRow) : null;
        if (!slot) return null;
        return <button key={'connected-' + item.instanceId} className="retained-attachment connected" type="button" style={{
          left: slot.boardRect.xPercent + '%', top: slot.boardRect.yPercent + '%',
          width: slot.boardRect.widthPercent + '%', height: slot.boardRect.heightPercent + '%',
        }} title={item.name + ' #' + item.instanceId} onClick={() => setSelectedInstalledAttachment({
          ...item,
          weaponInstanceId: equipment.instanceId,
          weaponName: equipment.name,
        })}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Wrench />}<span>{item.name}</span>
        </button>;
      }))}
      {loadout.equipment.flatMap(item => {
        const first = loadout.slots.find(slot => slot.slotKey === item.slotKeys[0]);
        const last = loadout.slots.find(slot => slot.slotKey === item.slotKeys[item.slotKeys.length - 1]);
        if (!first || !last || first.category !== 'HAND' || item.categoryCode !== 'weapon' || !item.imageUrl) return [];
        const overhang = HAND_EQUIPMENT_VISUAL.socketOverhangPercent;
        const equipmentHeight = last.boardRect.yPercent + last.boardRect.heightPercent - first.boardRect.yPercent;
        const slotCount = Math.max(item.slotKeys.length, 1);
        const overlayHeight = 100 / slotCount * HAND_EQUIPMENT_VISUAL.socketOverlayHeightRatio;
        return [...new Set(item.sockets.map(socket => socket.weaponSlotIndex))].map(weaponSlotIndex => {
          const center = (weaponSlotIndex - 0.5) * 100 / slotCount;
          const clipTop = Math.max(0, center - overlayHeight / 2);
          const clipBottom = Math.max(0, 100 - center - overlayHeight / 2);
          return <span key={'weapon-tab-' + item.instanceId + '-' + weaponSlotIndex} className="weapon-tab-overlay" style={{
            left: (first.boardRect.xPercent - overhang) + '%', top: first.boardRect.yPercent + '%',
            width: (first.boardRect.widthPercent + overhang) + '%', height: equipmentHeight + '%',
            clipPath: `inset(${clipTop}% ${100 - HAND_EQUIPMENT_VISUAL.socketOverlayWidthPercent}% ${clipBottom}% 0)`,
          }} aria-hidden="true"><img src={item.imageUrl} alt="" /></span>;
        });
      })}
      {loadout.retainedAttachments.map(item => {
        const slot = loadout.slots.find(entry => entry.slotKey === item.anchorSlotKey);
        if (!slot) return null;
        return <button key={item.instanceId} className="retained-attachment" type="button" style={{
          left: slot.boardRect.xPercent + '%', top: slot.boardRect.yPercent + '%',
          width: slot.boardRect.widthPercent + '%', height: slot.boardRect.heightPercent + '%',
        }} title={item.name + ' #' + item.instanceId} onClick={() => setSelectedRetainedAttachment(item)}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Wrench />}<span>{item.name}</span></button>;
      })}
    </div>
    <div className="equipment-cover-controls">
      {loadout.openedSlotKeys.map(slotKey => <button className="button secondary" type="button" key={slotKey} disabled={!canEdit || busy} onClick={() => void toggleCover(slotKey)}>
        <LockKeyhole />放回 {slotKey} 的 10 XP 蓋板
      </button>)}
    </div>

    {selectedSlot && <div className="equipment-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && closePicker()}>
      <section className="equipment-drawer" role="dialog" aria-modal="true" aria-labelledby="equipment-picker-title">
        <header><div><p className="eyebrow">WAGON EQUIPMENT</p><h2 id="equipment-picker-title">{replacementTarget ? '更換 ' + replacementTarget.name : '選擇放到 ' + selectedSlot + ' 的物品'}</h2></div><button type="button" onClick={closePicker} aria-label="關閉">×</button></header>
        {<div className="equipment-source-tabs" role="tablist" aria-label="裝備來源">
          <button type="button" role="tab" aria-selected={pickerSource === 'WAGON'} className={pickerSource === 'WAGON' ? 'active' : ''} onClick={() => void changePickerSource('WAGON')}>馬車裝備</button>
          <button type="button" role="tab" aria-selected={pickerSource === 'CATALOG'} className={pickerSource === 'CATALOG' ? 'active' : ''} onClick={() => void changePickerSource('CATALOG')}>物品列表</button>
        </div>}
        <label className="character-equipment-search"><Search /><input autoFocus value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} placeholder={pickerSource === 'WAGON' ? '搜尋名稱、ID 或 #ID' : '搜尋物品名稱或圖鑑 ID'} /></label>
        {pickerSource === 'WAGON'
          ? <div className="equipment-candidate-list">{filteredCandidates.length ? filteredCandidates.map(item => <button type="button" key={item.instanceId} className={preview?.instanceId === item.instanceId ? 'active' : ''} onClick={() => setPreview(item)}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <PackageOpen />}
            <span><strong>{item.name} #{item.instanceId}</strong><small>{item.categoryName} · 占 {item.slotCount} 格{item.damageMarkers ? ' · 毀損' : ''}</small><small>{item.notes || '無備註'}</small></span>
          </button>) : <p className="equipment-empty">沒有可放在此格的馬車裝備。</p>}</div>
          : <div className="equipment-candidate-list">{filteredCatalogCandidates.length ? filteredCatalogCandidates.map(item => <button type="button" key={item.itemId} className={catalogPreview?.itemId === item.itemId ? 'active' : ''} onClick={() => setCatalogPreview(item)}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <PackageOpen />}
            <span><strong>{item.name}</strong><small>{item.categoryName} · 占 {item.slotCount} 格</small><small>圖鑑物品 · 將建立新的裝備實體</small></span>
          </button>) : <p className="equipment-empty">沒有可放在此格的圖鑑物品。</p>}</div>}
        {preview && pickerSource === 'WAGON' && <footer><p>預覽占用：{preview.previewSlotKeys.join('、')}</p><button className="button" type="button" disabled={busy} onClick={() => void confirmEquip()}>{replacementTarget ? '確認更換' : '確認從馬車放置'}</button></footer>}
        {catalogPreview && pickerSource === 'CATALOG' && <footer><p>預覽占用：{catalogPreview.previewSlotKeys.join('、')}；將建立一件新的裝備。</p><button className="button" type="button" disabled={busy} onClick={() => void confirmCatalogEquip()}>確認建立並放置</button></footer>}
      </section>
    </div>}

    {selectedEquipment && <div className="equipment-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelectedEquipment(null)}>
      <section className="equipment-action-dialog" role="dialog" aria-modal="true" aria-labelledby="equipment-action-title">
        <header><div><p className="eyebrow">EQUIPMENT ACTIONS</p><h2 id="equipment-action-title">{selectedEquipment.name} #{selectedEquipment.instanceId}</h2></div><button type="button" onClick={() => setSelectedEquipment(null)} aria-label="關閉">×</button></header>
        <p>占用：{selectedEquipment.slotKeys.join('、')}</p>
        {selectedEquipment.notes && <p>備註：{selectedEquipment.notes}</p>}
        {selectedEquipment.attachments.length > 0 && <p>附件：{selectedEquipment.attachments.map(item => item.name + ' #' + item.instanceId).join('、')}</p>}
        {selectedEquipment.sockets.length > 0 && <div className="equipment-socket-list">
          <h3>附件孔位</h3>
          {selectedEquipment.sockets.map(socket => {
            const installed = selectedEquipment.attachments.find(item =>
              item.weaponSlotIndex === socket.weaponSlotIndex && item.socketIndex === socket.socketIndex
            );
            return <div key={socket.weaponSlotIndex + ':' + socket.socketIndex}>
              <span>第 {socket.weaponSlotIndex} 格／孔位 {socket.socketIndex} · {socket.connectorName}</span>
              {installed
                ? <small>已安裝：{installed.name} #{installed.instanceId}</small>
                : <button className="button secondary" type="button" disabled={busy} onClick={() => void openAttachmentPicker(selectedEquipment, socket)}>選擇附件</button>}
            </div>;
          })}
        </div>}
        {selectedEquipment.slotKeys.some(key => key.startsWith('HAND_')) && (() => {
          const hand = loadout.equipment.filter(entry => entry.slotKeys.some(key => key.startsWith('HAND_')))
            .sort((a, b) => Number(a.slotKeys[0].split('_')[1]) - Number(b.slotKeys[0].split('_')[1]));
          const index = hand.findIndex(entry => entry.instanceId === selectedEquipment.instanceId);
          return <div className="equipment-order-actions">
            <button className="button secondary" type="button" disabled={busy || index <= 0} onClick={() => void reorder(selectedEquipment, -1)}><ArrowUp />上移</button>
            <button className="button secondary" type="button" disabled={busy || index < 0 || index >= hand.length - 1} onClick={() => void reorder(selectedEquipment, 1)}><ArrowDown />下移</button>
          </div>;
        })()}
        <div className="equipment-dialog-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void openReplacementPicker(selectedEquipment)}>更換裝備</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => {
            setMovingEquipment(selectedEquipment);
            setMoveStartSlot(null);
            setSelectedEquipment(null);
          }}><Move />移動位置</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => void equipmentAction('damage')}>{selectedEquipment.damageMarkers ? '移除毀損標記' : '加入毀損標記'}</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => void equipmentAction('wagon')}>移入馬車</button>
          <button className="button danger" type="button" disabled={busy} onClick={() => void equipmentAction('remove')}>永久移除</button>
        </div>
      </section>
    </div>}

    {attachmentTarget && <div className="equipment-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && closeAttachmentPicker()}>
      <section className="equipment-drawer" role="dialog" aria-modal="true" aria-labelledby="attachment-picker-title">
        <header><div><p className="eyebrow">WAGON ATTACHMENTS</p><h2 id="attachment-picker-title">為 {attachmentTarget.equipment.name} 選擇附件</h2><p>只顯示可連接至「{attachmentTarget.socket.connectorName}」的附件。</p></div><button type="button" onClick={closeAttachmentPicker} aria-label="關閉">×</button></header>
        <div className="equipment-source-tabs" role="tablist" aria-label="附件來源">
          <button type="button" role="tab" aria-selected={attachmentSource === 'WAGON'} className={attachmentSource === 'WAGON' ? 'active' : ''} onClick={() => void changeAttachmentSource('WAGON')}>馬車附件</button>
          <button type="button" role="tab" aria-selected={attachmentSource === 'CATALOG'} className={attachmentSource === 'CATALOG' ? 'active' : ''} onClick={() => void changeAttachmentSource('CATALOG')}>附件列表</button>
        </div>
        <label className="character-equipment-search"><Search /><input autoFocus value={attachmentQuery} onChange={event => setAttachmentQuery(event.target.value)} placeholder={attachmentSource === 'WAGON' ? '搜尋名稱、ID 或 #ID' : '搜尋附件名稱或圖鑑 ID'} /></label>
        <div className="equipment-candidate-list">{attachmentSource === 'WAGON'
          ? (filteredAttachmentCandidates.length ? filteredAttachmentCandidates.map(item => <button type="button" key={item.instanceId} className={selectedAttachmentCandidate?.instanceId === item.instanceId ? 'active' : ''} onClick={() => setSelectedAttachmentCandidate(item)}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Wrench />}
              <span><strong>{item.name} #{item.instanceId}</strong><small>{item.connectorName}{item.damageMarkers ? ' · 毀損' : ''}</small><small>{item.notes || '無備註'}</small></span>
            </button>) : <p className="equipment-empty">馬車內沒有可連接的附件。</p>)
          : (filteredAttachmentCatalogCandidates.length ? filteredAttachmentCatalogCandidates.map(item => <button type="button" key={item.itemId} className={selectedAttachmentCatalogCandidate?.itemId === item.itemId ? 'active' : ''} onClick={() => setSelectedAttachmentCatalogCandidate(item)}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Wrench />}
              <span><strong>{item.name}</strong><small>{item.connectorName}</small><small>附件列表 · 將建立新的附件實體</small></span>
            </button>) : <p className="equipment-empty">附件列表沒有可連接的附件。</p>)}</div>
        {attachmentSource === 'WAGON' && selectedAttachmentCandidate && <footer><p>將安裝：{selectedAttachmentCandidate.name} #{selectedAttachmentCandidate.instanceId}</p><button className="button" type="button" disabled={busy} onClick={() => void confirmAttachmentInstall()}>確認安裝</button></footer>}
        {attachmentSource === 'CATALOG' && selectedAttachmentCatalogCandidate && <footer><p>將建立並安裝：{selectedAttachmentCatalogCandidate.name}</p><button className="button" type="button" disabled={busy} onClick={() => void confirmCatalogAttachmentInstall()}>確認建立並安裝</button></footer>}
      </section>
    </div>}

    {selectedInstalledAttachment && <div className="equipment-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelectedInstalledAttachment(null)}>
      <section className="equipment-action-dialog" role="dialog" aria-modal="true" aria-labelledby="installed-attachment-title">
        <header><div><p className="eyebrow">INSTALLED ATTACHMENT</p><h2 id="installed-attachment-title">{selectedInstalledAttachment.name} #{selectedInstalledAttachment.instanceId}</h2></div><button type="button" onClick={() => setSelectedInstalledAttachment(null)} aria-label="關閉">×</button></header>
        <p>目前安裝於：{selectedInstalledAttachment.weaponName} #{selectedInstalledAttachment.weaponInstanceId}</p>
        <p>第 {selectedInstalledAttachment.weaponSlotIndex} 格／孔位 {selectedInstalledAttachment.socketIndex}</p>
        <div className="equipment-dialog-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void installedAttachmentAction('wagon')}>移入馬車</button>
          <button className="button danger" type="button" disabled={busy} onClick={() => void installedAttachmentAction('remove')}>永久移除</button>
        </div>
      </section>
    </div>}

    {selectedRetainedAttachment && <div className="equipment-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelectedRetainedAttachment(null)}>
      <section className="equipment-action-dialog" role="dialog" aria-modal="true" aria-labelledby="retained-attachment-title">
        <header><div><p className="eyebrow">RETAINED ATTACHMENT</p><h2 id="retained-attachment-title">{selectedRetainedAttachment.name} #{selectedRetainedAttachment.instanceId}</h2></div><button type="button" onClick={() => setSelectedRetainedAttachment(null)} aria-label="關閉">×</button></header>
        <p>附件保留位置：{selectedRetainedAttachment.anchorSlotKey}</p>
        {selectedRetainedAttachment.notes && <p>備註：{selectedRetainedAttachment.notes}</p>}
        <div className="equipment-dialog-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void retainedAttachmentAction('wagon')}>移入馬車</button>
          <button className="button danger" type="button" disabled={busy} onClick={() => void retainedAttachmentAction('remove')}>永久移除</button>
        </div>
      </section>
    </div>}
  </section>;
}
