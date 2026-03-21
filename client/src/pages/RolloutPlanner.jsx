import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, Trash2, Edit3, Check, X, GripVertical, Folder, Search, Tag, Youtube, Instagram, LayoutGrid, Film, Loader2, Calendar } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { gridApi, reelCollectionApi, rolloutApi } from '../lib/api';
import RolloutIntelligencePanel from '../components/rollout/RolloutIntelligencePanel';
import { ReleaseArchetypePanel, SeasonalIntelligencePanel } from '../components/rollout';

// TikTok icon component
function TikTokIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
    </svg>
  );
}

// Helper to format date for input
const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// Helper to calculate days until deadline
const getDaysUntil = (date) => {
  if (!date) return null;
  const now = new Date();
  const target = new Date(date);
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff;
};

const ROLLOUT_TEMPLATES = [
  {
    id: 'core-album',
    name: 'Core Album Blueprint',
    tag: 'Core',
    description: 'Five-phase launch: Tease → Announce → Drip → Drop → Sustain.',
    phases: [
      { name: 'Tease', notes: 'Mood teasers, cryptic hints, visual motifs.' },
      { name: 'Announce', notes: 'Title, date, cover. Pre-save CTA.' },
      { name: 'Drip', notes: 'Singles/snippets weekly, behind-the-scenes.' },
      { name: 'Drop', notes: 'Launch day blitz, live stream, press hits.' },
      { name: 'Sustain', notes: 'Remixes, UGC campaigns, tour tie-ins.' },
    ],
  },
  {
    id: 'core-product',
    name: 'Core Product Blueprint',
    tag: 'Core',
    description: 'Awareness → Authority → Conversion → Retention.',
    phases: [
      { name: 'Awareness', notes: 'Problem agitation, story ads, hooks.' },
      { name: 'Authority', notes: 'Proof, testimonials, case drops.' },
      { name: 'Conversion', notes: 'Offer windows, demos, live Q&A.' },
      { name: 'Retention', notes: 'Onboarding, community challenges, upsell.' },
    ],
  },
  {
    id: 'chromakopia-inspired',
    name: 'Inspired: Chromakopia',
    tag: 'Inspired',
    description: 'High-visual, lore-driven rollout with color-coded chapters.',
    phases: [
      { name: 'Lore Seeds', notes: 'Cryptic posts, visual glyphs.' },
      { name: 'Chapter Reveals', notes: 'Drop chapters with distinct palettes.' },
      { name: 'Hero Drop', notes: 'Full project, live moment, merch tie-in.' },
      { name: 'Afterglow', notes: 'Remixes, fan edits, alt covers.' },
    ],
  },
  {
    id: 'charli-velocity',
    name: 'Inspired: Charli Velocity',
    tag: 'Inspired',
    description: 'Fast-cadence social blitz with short hooks and rapid iterations.',
    phases: [
      { name: 'Hook Storm', notes: 'Daily hooks/snippets, meme edges.' },
      { name: 'Pre-Save Surge', notes: 'Countdowns, share-to-unlock moments.' },
      { name: 'Drop Day', notes: 'Live room, collab stitches, platform takeovers.' },
      { name: 'Iterate', notes: 'Alt cuts, sped/slowed, fan feature loop.' },
    ],
  },
];

// Rollout Scheduling Panel Component
function RolloutSchedulingPanel({ rollout, onSchedule, saving }) {
  const [startDate, setStartDate] = useState(formatDateForInput(rollout.startDate));
  const [endDate, setEndDate] = useState(formatDateForInput(rollout.endDate));
  const [isExpanded, setIsExpanded] = useState(!!rollout.startDate || !!rollout.endDate);

  // Update local state when rollout changes
  useEffect(() => {
    setStartDate(formatDateForInput(rollout.startDate));
    setEndDate(formatDateForInput(rollout.endDate));
  }, [rollout.startDate, rollout.endDate]);

  const handleSave = () => {
    onSchedule({
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null,
    });
  };

  const hasChanges =
    formatDateForInput(rollout.startDate) !== startDate ||
    formatDateForInput(rollout.endDate) !== endDate;

  const daysUntilStart = getDaysUntil(rollout.startDate);
  const daysUntilEnd = getDaysUntil(rollout.endDate);

  return (
    <div className="bg-dark-800/60  overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-dark-300 uppercase tracking-wider">Schedule</span>
          {(rollout.startDate || rollout.endDate) && (
            <div className="flex items-center gap-2 text-xs text-dark-400">
              {rollout.startDate && (
                <span>
                  {new Date(rollout.startDate).toLocaleDateString()}
                  {daysUntilStart !== null && daysUntilStart >= 0 && (
                    <span className="ml-1 opacity-60">({daysUntilStart}d)</span>
                  )}
                </span>
              )}
              {rollout.startDate && rollout.endDate && <span className="text-dark-600">&mdash;</span>}
              {rollout.endDate && (
                <span>
                  {new Date(rollout.endDate).toLocaleDateString()}
                  {daysUntilEnd !== null && (
                    <span className={`ml-1 opacity-60 ${daysUntilEnd < 0 ? 'text-dark-300' : ''}`}>
                      ({daysUntilEnd < 0 ? 'overdue' : `${daysUntilEnd}d`})
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-dark-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">
                Start
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700/50 rounded text-white text-sm focus:outline-none focus:border-dark-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">
                Deadline
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700/50 rounded text-white text-sm focus:outline-none focus:border-dark-500"
              />
            </div>
          </div>

          {hasChanges && (
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-white bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Schedule
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RolloutPlanner() {
  const rollouts = useAppStore((state) => state.rollouts);
  const setRollouts = useAppStore((state) => state.setRollouts);
  const currentRolloutId = useAppStore((state) => state.currentRolloutId);
  const youtubeCollections = useAppStore((state) => state.youtubeCollections);
  const setCurrentRollout = useAppStore((state) => state.setCurrentRollout);
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const activeFolioId = useAppStore((state) => state.activeFolioId);
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  // Find current rollout - support both backend _id and local id
  const currentRollout = rollouts.find((r) => (r._id || r.id) === currentRolloutId) || null;

  // Loading states
  const [loadingRollouts, setLoadingRollouts] = useState(false);
  const [savingRollout, setSavingRollout] = useState(false);

  // Grid metadata for colors
  const gridMeta = useAppStore((state) => state.gridMeta);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newRolloutName, setNewRolloutName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState(null);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'templates'

  // Backend grids (IG/TikTok)
  const [grids, setGrids] = useState([]);
  const [loadingGrids, setLoadingGrids] = useState(false);

  // Backend reel collections (IG/TikTok Reels)
  const [reelCollections, setReelCollections] = useState([]);
  const [loadingReelCollections, setLoadingReelCollections] = useState(false);

  // Fetch grids from backend
  const fetchGrids = useCallback(async () => {
    try {
      setLoadingGrids(true);
      const data = await gridApi.getAll();
      setGrids(data.grids || []);
    } catch (err) {
      console.error('Failed to fetch grids:', err);
    } finally {
      setLoadingGrids(false);
    }
  }, []);

  // Fetch reel collections from backend
  const fetchReelCollections = useCallback(async () => {
    try {
      setLoadingReelCollections(true);
      const collections = await reelCollectionApi.getAll();
      setReelCollections(collections || []);
    } catch (err) {
      console.error('Failed to fetch reel collections:', err);
    } finally {
      setLoadingReelCollections(false);
    }
  }, []);

  // Fetch rollouts from backend
  const fetchRollouts = useCallback(async () => {
    try {
      setLoadingRollouts(true);
      const data = await rolloutApi.getAll();
      // Transform backend rollouts to use 'id' field for consistency
      const transformedRollouts = (data.rollouts || []).map(r => ({
        ...r,
        id: r._id, // Use _id as id for consistency
      }));
      setRollouts(transformedRollouts);
      // Auto-select first rollout if none selected
      if (transformedRollouts.length > 0 && !currentRolloutId) {
        setCurrentRollout(transformedRollouts[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch rollouts:', err);
    } finally {
      setLoadingRollouts(false);
    }
  }, [setRollouts, currentRolloutId, setCurrentRollout]);

  useEffect(() => {
    fetchGrids();
    fetchReelCollections();
    fetchRollouts();
  }, [fetchGrids, fetchReelCollections, fetchRollouts]);

  // Combine all collections from all platforms
  const allCollections = [
    // YouTube collections
    ...youtubeCollections.map(c => ({
      ...c,
      platform: 'youtube',
      itemCount: 0, // Could be video count
    })),
    // Instagram grids
    ...grids.filter(g => g.platform === 'instagram' || !g.platform).map(g => ({
      id: g._id,
      name: g.name,
      platform: 'instagram',
      color: gridMeta[g._id]?.color || null,
      tags: [],
      itemCount: g.cells?.filter(c => !c.isEmpty).length || 0,
    })),
    // TikTok grids
    ...grids.filter(g => g.platform === 'tiktok').map(g => ({
      id: g._id,
      name: g.name,
      platform: 'tiktok',
      color: gridMeta[g._id]?.color || null,
      tags: [],
      itemCount: g.cells?.filter(c => !c.isEmpty).length || 0,
    })),
    // Instagram Reel collections
    ...reelCollections.filter(rc => rc.platform === 'instagram').map(rc => ({
      id: rc._id,
      name: rc.name,
      platform: 'instagram-reels',
      color: rc.color || null,
      tags: rc.tags || [],
      itemCount: rc.reels?.length || 0,
    })),
    // TikTok Reel collections
    ...reelCollections.filter(rc => rc.platform === 'tiktok').map(rc => ({
      id: rc._id,
      name: rc.name,
      platform: 'tiktok-reels',
      color: rc.color || null,
      tags: rc.tags || [],
      itemCount: rc.reels?.length || 0,
    })),
  ];

  // Create rollout via API
  const handleCreateRollout = async () => {
    if (!newRolloutName.trim()) return;
    try {
      setSavingRollout(true);
      const data = await rolloutApi.create({ name: newRolloutName.trim() });
      const newRollout = { ...data.rollout, id: data.rollout._id };
      setRollouts([newRollout, ...rollouts]);
      setCurrentRollout(newRollout._id);
      setNewRolloutName('');
      setIsCreating(false);
      setDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create rollout:', err);
      alert('Failed to create rollout');
    } finally {
      setSavingRollout(false);
    }
  };

  const handleSelectRollout = (rollout) => {
    setCurrentRollout(rollout._id || rollout.id);
    setDropdownOpen(false);
  };

  // Delete rollout via API
  const handleDeleteRollout = async () => {
    if (!currentRolloutId) return;
    if (window.confirm('Delete this rollout?')) {
      try {
        setSavingRollout(true);
        await rolloutApi.delete(currentRolloutId);
        setRollouts(rollouts.filter(r => (r._id || r.id) !== currentRolloutId));
        setCurrentRollout(null);
      } catch (err) {
        console.error('Failed to delete rollout:', err);
        alert('Failed to delete rollout');
      } finally {
        setSavingRollout(false);
      }
    }
  };

  // Apply template: create rollout, add phases as sections
  const [templateApplying, setTemplateApplying] = useState(null);
  const handleApplyTemplate = useCallback(async (template) => {
    try {
      setTemplateApplying(template.id);
      // Create rollout
      const created = await rolloutApi.create({ name: template.name, status: 'draft', description: template.description, tag: template.tag });
      let newRollout = { ...created.rollout, id: created.rollout?._id || created.rollout?.id };
      newRollout.templateId = template.id;
      newRollout.templateName = template.name;
      // Add sections sequentially
      for (let i = 0; i < template.phases.length; i++) {
        const phase = template.phases[i];
        const res = await rolloutApi.addSection(newRollout.id, {
          name: phase.name,
          order: i,
          notes: phase.notes,
        });
        newRollout = { ...res.rollout, id: res.rollout?._id || res.rollout?.id };
      }
      // Refresh rollouts list by fetching or injecting
      const fetched = await rolloutApi.getAll();
      const transformed = (fetched.rollouts || []).map(r => ({ ...r, id: r._id || r.id }));
      setRollouts(transformed);
      setCurrentRollout(newRollout.id);
    } catch (err) {
      console.error('Failed to apply template:', err);
      alert('Failed to apply template');
    } finally {
      setTemplateApplying(null);
    }
  }, [setRollouts, setCurrentRollout, activeFolioId, activeProjectId, currentProfileId]);

  const handleStartEditName = () => {
    if (!currentRollout) return;
    setEditedName(currentRollout.name);
    setEditingName(true);
  };

  // Update rollout name via API
  const handleSaveName = async () => {
    if (!currentRolloutId || !editedName.trim()) return;
    try {
      setSavingRollout(true);
      const data = await rolloutApi.update(currentRolloutId, { name: editedName.trim() });
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
      setEditingName(false);
    } catch (err) {
      console.error('Failed to update rollout:', err);
      alert('Failed to update rollout');
    } finally {
      setSavingRollout(false);
    }
  };

  // Add section via API
  const handleAddSection = async () => {
    if (!currentRolloutId) return;
    try {
      setSavingRollout(true);
      const data = await rolloutApi.addSection(currentRolloutId, {
        name: `Phase ${(currentRollout?.sections?.length || 0) + 1}`,
      });
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
    } catch (err) {
      console.error('Failed to add section:', err);
      alert('Failed to add section');
    } finally {
      setSavingRollout(false);
    }
  };

  const handleDragStart = (index) => {
    setDraggedSectionIndex(index);
  };

  // Reorder sections via API
  const handleDragOver = async (e, index) => {
    e.preventDefault();
    if (draggedSectionIndex === null || draggedSectionIndex === index) return;

    // Optimistic update - reorder locally first
    const sections = [...(currentRollout?.sections || [])];
    const [movedSection] = sections.splice(draggedSectionIndex, 1);
    sections.splice(index, 0, movedSection);

    // Update order property
    const reorderedSections = sections.map((s, i) => ({ ...s, order: i }));

    setRollouts(rollouts.map(r =>
      (r._id || r.id) === currentRolloutId
        ? { ...r, sections: reorderedSections }
        : r
    ));
    setDraggedSectionIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedSectionIndex === null || !currentRolloutId) {
      setDraggedSectionIndex(null);
      return;
    }

    // Persist to backend
    try {
      const sectionIds = currentRollout?.sections?.map(s => s.id) || [];
      await rolloutApi.reorderSections(currentRolloutId, sectionIds);
    } catch (err) {
      console.error('Failed to save section reorder:', err);
      // Refresh to get correct order
      fetchRollouts();
    }
    setDraggedSectionIndex(null);
  };

  // Update section via API
  const handleUpdateSection = async (sectionId, updates) => {
    if (!currentRolloutId) return;
    try {
      const data = await rolloutApi.updateSection(currentRolloutId, sectionId, updates);
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
    } catch (err) {
      console.error('Failed to update section:', err);
    }
  };

  // Delete section via API
  const handleDeleteSection = async (sectionId) => {
    if (!currentRolloutId) return;
    try {
      const data = await rolloutApi.deleteSection(currentRolloutId, sectionId);
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
    } catch (err) {
      console.error('Failed to delete section:', err);
    }
  };

  // Add collection to section via API
  const handleAddCollectionToSection = async (sectionId, collectionId) => {
    if (!currentRolloutId) return;
    try {
      const data = await rolloutApi.addCollectionToSection(currentRolloutId, sectionId, collectionId);
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
    } catch (err) {
      console.error('Failed to add collection to section:', err);
    }
  };

  // Remove collection from section via API
  const handleRemoveCollectionFromSection = async (sectionId, collectionId) => {
    if (!currentRolloutId) return;
    try {
      const data = await rolloutApi.removeCollectionFromSection(currentRolloutId, sectionId, collectionId);
      setRollouts(rollouts.map(r =>
        (r._id || r.id) === currentRolloutId
          ? { ...data.rollout, id: data.rollout._id }
          : r
      ));
    } catch (err) {
      console.error('Failed to remove collection from section:', err);
    }
  };

  const getCollectionById = (id) => allCollections.find((c) => c.id === id);

  const currentSectionCollectionIds = pickerSectionId
    ? currentRollout?.sections?.find((s) => s.id === pickerSectionId)?.collectionIds || []
    : [];

  return (
    <div className="space-y-4">
      {/* Header + Toolbar */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-sans font-medium text-dark-100 tracking-tight">Rollout</h2>

        {/* Dropdown Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-dark-700/50 rounded text-white hover:border-dark-500 transition-colors min-w-[180px]"
          >
            <span className="flex-1 text-left truncate">
              {currentRollout?.name || 'Select Rollout'}
            </span>
            <ChevronDown className="w-4 h-4 text-dark-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-dark-900 border border-dark-700/50  shadow-2xl z-50 overflow-hidden">
              {rollouts.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  {rollouts.map((rollout) => (
                    <button
                      key={rollout.id}
                      type="button"
                      onClick={() => handleSelectRollout(rollout)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                        rollout.id === currentRolloutId
                          ? 'bg-dark-800 text-white'
                          : 'text-dark-300 hover:text-white hover:bg-dark-800/50'
                      }`}
                    >
                      <span className="flex-1 truncate">{rollout.name}</span>
                      <span className="text-[10px] text-dark-500 uppercase tracking-wider">
                        {rollout.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="p-2.5 border-t border-dark-700/50">
                {isCreating ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRolloutName}
                      onChange={(e) => setNewRolloutName(e.target.value)}
                      placeholder="Rollout name..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateRollout();
                        if (e.key === 'Escape') setIsCreating(false);
                      }}
                      className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600  text-white text-sm focus:outline-none focus:border-dark-300"
                    />
                    <button
                      type="button"
                      onClick={handleCreateRollout}
                      className="p-2 bg-dark-100  text-white hover:bg-white"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="p-2 bg-dark-600  text-dark-300 hover:bg-dark-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-dark-500 hover:text-white transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Rollout</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rollout Actions */}
        {currentRollout && (
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  autoFocus
                  className="px-3 py-1.5 bg-dark-700 border border-dark-600  text-white text-sm focus:outline-none focus:border-dark-300"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="p-1.5 text-dark-100 hover:bg-dark-700 rounded"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  className="p-1.5 text-dark-400 hover:bg-dark-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartEditName}
                  className="p-2 text-dark-400 hover:text-white hover:bg-dark-700  transition-colors"
                  title="Rename"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRollout}
                  className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700  transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-dark-800">
        {[
          { id: 'schedule', label: 'Schedule' },
          { id: 'templates', label: 'Templates' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2 text-xs tracking-wide transition-colors border-b ${
              activeTab === tab.id
                ? 'text-white border-white'
                : 'text-dark-500 border-transparent hover:text-dark-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ROLLOUT_TEMPLATES.map((tpl) => (
              <div key={tpl.id} className={`bg-dark-800/60  p-4 flex flex-col gap-2 hover:bg-dark-800 transition-colors border-l-2 ${
                tpl.tag === 'Inspired' ? 'border-l-pink-500/40' : 'border-l-dark-400/40'
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{tpl.name}</p>
                  <span className={`text-[10px] uppercase tracking-wider ${
                    tpl.tag === 'Inspired' ? 'text-pink-400/60' : 'text-dark-500'
                  }`}>
                    {tpl.tag}
                  </span>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed">{tpl.description}</p>
                <div className="text-[11px] text-dark-500 tracking-wide">
                  {tpl.phases.map(p => p.name).join('  /  ')}
                </div>
                <button
                  onClick={() => handleApplyTemplate(tpl)}
                  disabled={!!templateApplying}
                  className="mt-2 self-start text-xs text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {templateApplying === tpl.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />
                      Applying...
                    </>
                  ) : (
                    'Apply'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <>
          {/* Rollout Scheduling Panel */}
          {currentRollout && (
            <RolloutSchedulingPanel
              rollout={currentRollout}
              onSchedule={async (scheduleData) => {
                try {
                  setSavingRollout(true);
                  const data = await rolloutApi.scheduleRollout(currentRolloutId, scheduleData);
                  setRollouts(rollouts.map(r =>
                    (r._id || r.id) === currentRolloutId
                      ? { ...data.rollout, id: data.rollout._id }
                      : r
                  ));
                } catch (err) {
                  console.error('Failed to schedule rollout:', err);
                  alert('Failed to schedule rollout');
                } finally {
                  setSavingRollout(false);
                }
              }}
              saving={savingRollout}
            />
          )}

          {/* Release Coordinator Panels */}
          <ReleaseArchetypePanel />
          <SeasonalIntelligencePanel />

          {/* BLUE OCEAN: Rollout Intelligence Panel */}
          {currentRollout && currentRolloutId && (
            <RolloutIntelligencePanel
              rolloutId={currentRolloutId}
              rollout={currentRollout}
            />
          )}

          {/* Content */}
          {!currentRollout ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-xs text-dark-500 mb-4 tracking-wide">No rollout selected</p>
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(true);
                  setIsCreating(true);
                }}
                className="text-xs text-dark-400 hover:text-white transition-colors"
              >
                + Create Rollout
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sections */}
              {currentRollout.sections
                .sort((a, b) => a.order - b.order)
                .map((section, index) => (
                  <RolloutSection
                    key={section.id}
                    section={section}
                    index={index}
                    rolloutId={currentRolloutId}
                    collections={section.collectionIds.map(getCollectionById).filter(Boolean)}
                    onOpenPicker={() => setPickerSectionId(section.id)}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedSectionIndex === index}
                    onUpdateSection={handleUpdateSection}
                    onDeleteSection={handleDeleteSection}
                    onRemoveCollection={handleRemoveCollectionFromSection}
                    onSetDeadline={async (sectionId, deadlineData) => {
                      try {
                        const data = await rolloutApi.setSectionDeadline(currentRolloutId, sectionId, deadlineData);
                        setRollouts(rollouts.map(r =>
                          (r._id || r.id) === currentRolloutId
                            ? { ...data.rollout, id: data.rollout._id }
                            : r
                        ));
                      } catch (err) {
                        console.error('Failed to set section deadline:', err);
                        alert('Failed to set section deadline');
                      }
                    }}
                  />
                ))}

              {/* Add Section Button */}
              <button
                type="button"
                onClick={handleAddSection}
                className="w-full py-3 text-xs text-dark-500 hover:text-white transition-colors tracking-wide"
              >
                + Add Section
              </button>
            </div>
          )}
        </>
      )}

      {/* Collection Picker Modal */}
      {pickerSectionId && (
        <CollectionPicker
          collections={allCollections}
          selectedIds={currentSectionCollectionIds}
          onSelect={(collectionId) => {
            handleAddCollectionToSection(pickerSectionId, collectionId);
          }}
          onClose={() => setPickerSectionId(null)}
        />
      )}
    </div>
  );
}

function RolloutSection({
  section,
  index,
  rolloutId,
  collections,
  onOpenPicker,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  onUpdateSection,
  onDeleteSection,
  onRemoveCollection,
  onSetDeadline,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(section.name);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sectionStartDate, setSectionStartDate] = useState(formatDateForInput(section.startDate));
  const [sectionDeadline, setSectionDeadline] = useState(formatDateForInput(section.deadline));

  // Update local state when section changes
  useEffect(() => {
    setSectionStartDate(formatDateForInput(section.startDate));
    setSectionDeadline(formatDateForInput(section.deadline));
  }, [section.startDate, section.deadline]);

  const handleSaveDates = () => {
    onSetDeadline(section.id, {
      startDate: sectionStartDate ? new Date(sectionStartDate).toISOString() : null,
      deadline: sectionDeadline ? new Date(sectionDeadline).toISOString() : null,
    });
    setShowDatePicker(false);
  };

  const daysUntilDeadline = getDaysUntil(section.deadline);

  const handleSaveName = () => {
    if (!editedName.trim()) return;
    onUpdateSection(section.id, { name: editedName.trim() });
    setIsEditing(false);
  };

  return (
    <div
      className={`bg-dark-800/60  overflow-hidden transition-all border-l-2 border-l-dark-400/60 ${
        isDragging ? 'opacity-50 ring-1 ring-dark-500' : ''
      }`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* Section Header */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="cursor-grab text-dark-600 hover:text-dark-400">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        <span className="text-[10px] text-dark-500 uppercase tracking-widest">
          {index + 1}
        </span>

        {/* Section dates display */}
        {(section.startDate || section.deadline) && (
          <div className="flex items-center gap-1.5 text-[11px] text-dark-500">
            {section.startDate && (
              <span>{new Date(section.startDate).toLocaleDateString()}</span>
            )}
            {section.startDate && section.deadline && <span>&mdash;</span>}
            {section.deadline && (
              <span className={daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-dark-300' : ''}>
                {new Date(section.deadline).toLocaleDateString()}
                {daysUntilDeadline !== null && (
                  <span className="ml-1 opacity-60">
                    ({daysUntilDeadline < 0 ? 'overdue' : `${daysUntilDeadline}d`})
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
              className="flex-1 px-2 py-1 bg-dark-700 border border-dark-600 rounded text-white text-sm focus:outline-none focus:border-dark-300"
            />
            <button type="button" onClick={handleSaveName} className="p-1 text-dark-100">
              <Check className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="p-1 text-dark-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <h3 className="flex-1 text-sm font-medium text-white">{section.name}</h3>
        )}

        <div className="flex items-center gap-1">
          {/* Date picker button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`p-1.5 hover:bg-dark-700 rounded transition-colors ${
                section.startDate || section.deadline ? 'text-dark-100' : 'text-dark-400 hover:text-white'
              }`}
              title="Set dates"
            >
              <Calendar className="w-4 h-4 text-white" />
            </button>
            {showDatePicker && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-dark-900 border border-dark-600  shadow-xl z-50 p-3">
                <p className="text-xs text-dark-400 mb-3">Section Schedule</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={sectionStartDate}
                      onChange={(e) => setSectionStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-dark-700 border border-dark-600 rounded text-sm text-white focus:outline-none focus:border-dark-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Deadline
                    </label>
                    <input
                      type="date"
                      value={sectionDeadline}
                      onChange={(e) => setSectionDeadline(e.target.value)}
                      min={sectionStartDate || undefined}
                      className="w-full px-2 py-1.5 bg-dark-700 border border-dark-600 rounded text-sm text-white focus:outline-none focus:border-dark-300"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(false)}
                      className="flex-1 px-3 py-1.5 text-xs text-dark-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDates}
                      className="flex-1 px-3 py-1.5 text-xs bg-dark-100 text-dark-900 rounded hover:bg-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                setEditedName(section.name);
                setIsEditing(true);
              }}
              className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDeleteSection(section.id)}
            className="p-1.5 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Section Content */}
      <div className="px-4 pb-3">
        {collections.length === 0 ? (
          <p className="text-center text-dark-600 text-xs py-3">No collections</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
            {collections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onRemove={() => onRemoveCollection(section.id, collection.id)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenPicker}
          className="w-full py-2 text-xs text-dark-500 hover:text-white transition-colors tracking-wide"
        >
          + Add Collection
        </button>
      </div>
    </div>
  );
}

function CollectionCard({ collection, onRemove }) {
  const collectionColor = collection.color || '#6b7280';

  // Get platform icon
  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'youtube':
        return <Youtube className="w-4 h-4" />;
      case 'instagram':
        return <Instagram className="w-4 h-4" />;
      case 'instagram-reels':
        return <Film className="w-4 h-4" />;
      case 'tiktok':
        return <TikTokIcon className="w-4 h-4" />;
      case 'tiktok-reels':
        return <Film className="w-4 h-4" />;
      default:
        return <Folder className="w-4 h-4" />;
    }
  };

  // Get platform color
  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'youtube':
        return '#ef4444';
      case 'instagram':
        return '#e1306c';
      case 'instagram-reels':
        return '#c13584'; // Instagram gradient purple
      case 'tiktok':
        return '#00f2ea';
      case 'tiktok-reels':
        return '#ff0050'; // TikTok red
      default:
        return '#8b5cf6';
    }
  };

  // Get platform badge text
  const getPlatformBadge = (platform) => {
    switch (platform) {
      case 'youtube':
        return 'YT';
      case 'instagram':
        return 'IG';
      case 'instagram-reels':
        return 'IG Reels';
      case 'tiktok':
        return 'TT';
      case 'tiktok-reels':
        return 'TT Reels';
      default:
        return '';
    }
  };

  const platformColor = getPlatformColor(collection.platform);

  return (
    <div
      className="group relative flex items-center gap-2.5 p-2.5 bg-dark-800 rounded hover:bg-dark-700 transition-colors border-l-2"
      style={{ borderLeftColor: platformColor }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white truncate">{collection.name}</span>
          {collection.platform && (
            <span className="text-[10px] flex-shrink-0" style={{ color: platformColor }}>
              {getPlatformBadge(collection.platform)}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 text-dark-500 hover:text-dark-200 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CollectionPicker({ collections, selectedIds, onSelect, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState(null); // null = all, 'youtube', 'instagram', 'tiktok', 'instagram-reels', 'tiktok-reels'
  const addYoutubeCollection = useAppStore((state) => state.addYoutubeCollection);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');

  const allTags = [...new Set(collections.flatMap((c) => c.tags || []))].sort();

  // Platform counts
  const platformCounts = {
    youtube: collections.filter(c => c.platform === 'youtube').length,
    instagram: collections.filter(c => c.platform === 'instagram').length,
    tiktok: collections.filter(c => c.platform === 'tiktok').length,
    'instagram-reels': collections.filter(c => c.platform === 'instagram-reels').length,
    'tiktok-reels': collections.filter(c => c.platform === 'tiktok-reels').length,
  };

  const filteredCollections = collections.filter((c) => {
    const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.every((t) => (c.tags || []).includes(t));
    const matchesPlatform = !selectedPlatform || c.platform === selectedPlatform;
    const notSelected = !selectedIds.includes(c.id);
    return matchesSearch && matchesTags && matchesPlatform && notSelected;
  });

  // Helper to get platform icon
  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'youtube':
        return <Youtube className="w-4 h-4" />;
      case 'instagram':
        return <Instagram className="w-4 h-4" />;
      case 'instagram-reels':
        return <Film className="w-4 h-4" />;
      case 'tiktok':
        return <TikTokIcon className="w-4 h-4" />;
      case 'tiktok-reels':
        return <Film className="w-4 h-4" />;
      default:
        return <Folder className="w-4 h-4" />;
    }
  };

  // Helper to get platform color
  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'youtube':
        return '#ef4444'; // red
      case 'instagram':
        return '#e1306c'; // pink/magenta
      case 'instagram-reels':
        return '#c13584'; // Instagram purple
      case 'tiktok':
        return '#00f2ea'; // tiktok cyan
      case 'tiktok-reels':
        return '#ff0050'; // TikTok red
      default:
        return '#8b5cf6'; // purple
    }
  };

  // Helper to get platform badge text
  const getPlatformBadge = (platform) => {
    switch (platform) {
      case 'youtube':
        return 'YT';
      case 'instagram':
        return 'IG';
      case 'instagram-reels':
        return 'IG Reels';
      case 'tiktok':
        return 'TT';
      case 'tiktok-reels':
        return 'TT Reels';
      default:
        return '';
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const tags = newTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    // Note: addYoutubeCollection in Slayt takes just a name string
    // We need to check if it supports tags
    addYoutubeCollection(newName.trim());
    setNewName('');
    setNewTags('');
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-dark-800 border border-dark-700  overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
          <h3 className="font-medium text-white">Add Collection</h3>
          <button type="button" onClick={onClose} className="p-1 text-dark-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-700">
          <Search className="w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections..."
            className="flex-1 bg-transparent text-white placeholder-dark-500 focus:outline-none"
          />
        </div>

        {/* Platform Filter Tabs */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-dark-700">
          <button
            type="button"
            onClick={() => setSelectedPlatform(null)}
            className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
              selectedPlatform === null
                ? 'bg-dark-100 text-dark-900'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>All ({collections.filter(c => !selectedIds.includes(c.id)).length})</span>
          </button>
          {platformCounts.youtube > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlatform('youtube')}
              className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
                selectedPlatform === 'youtube'
                  ? 'bg-dark-100 text-dark-900'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <Youtube className="w-4 h-4" />
              <span>{platformCounts.youtube}</span>
            </button>
          )}
          {platformCounts.instagram > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlatform('instagram')}
              className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
                selectedPlatform === 'instagram'
                  ? 'bg-pink-500 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <Instagram className="w-4 h-4" />
              <span>{platformCounts.instagram}</span>
            </button>
          )}
          {platformCounts.tiktok > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlatform('tiktok')}
              className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
                selectedPlatform === 'tiktok'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <TikTokIcon className="w-4 h-4" />
              <span>{platformCounts.tiktok}</span>
            </button>
          )}
          {platformCounts['instagram-reels'] > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlatform('instagram-reels')}
              className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
                selectedPlatform === 'instagram-reels'
                  ? 'bg-purple-500 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>IG Reels ({platformCounts['instagram-reels']})</span>
            </button>
          )}
          {platformCounts['tiktok-reels'] > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlatform('tiktok-reels')}
              className={`flex items-center gap-2 px-3 py-1.5  text-sm transition-colors ${
                selectedPlatform === 'tiktok-reels'
                  ? 'bg-rose-500 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>TT Reels ({platformCounts['tiktok-reels']})</span>
            </button>
          )}
        </div>

        {/* Tags Filter */}
        {allTags.length > 0 && (
          <div className="px-4 py-3 border-b border-dark-700">
            <div className="flex items-center gap-2 text-xs text-dark-500 mb-2">
              <Tag className="w-3.5 h-3.5" />
              <span>Filter by tags:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-dark-100 text-dark-900'
                      : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <div className="max-h-64 overflow-y-auto">
          {filteredCollections.length === 0 ? (
            <p className="text-center text-dark-500 py-8">No collections found</p>
          ) : (
            filteredCollections.map((collection) => {
              const platformColor = getPlatformColor(collection.platform);
              const collectionColor = collection.color || platformColor;
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => onSelect(collection.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700 transition-colors"
                  style={{ borderLeftWidth: '3px', borderLeftColor: collectionColor }}
                >
                  <div
                    className="w-10 h-10  flex items-center justify-center"
                    style={{ backgroundColor: `${platformColor}20`, color: platformColor }}
                  >
                    {getPlatformIcon(collection.platform)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{collection.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${platformColor}20`, color: platformColor }}
                      >
                        {getPlatformBadge(collection.platform)}
                      </span>
                    </div>
                    {collection.tags && collection.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {collection.tags.map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 bg-dark-600 rounded text-dark-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {collection.itemCount > 0 && (
                      <span className="text-xs text-dark-500 mt-1 block">
                        {collection.itemCount} items
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-700">
          {isCreating ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name..."
                autoFocus
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600  text-white text-sm focus:outline-none focus:border-dark-300"
              />
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Tags (comma-separated)..."
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600  text-white text-sm focus:outline-none focus:border-dark-300"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-sm text-dark-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-3 py-1.5 text-sm bg-dark-100 text-dark-900  hover:bg-white"
                >
                  Create & Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-dark-600  text-dark-400 hover:border-dark-100 hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Collection</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RolloutPlanner;
