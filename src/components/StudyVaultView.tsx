import React, { useEffect, useState } from 'react';
import { Folder, ExternalLink, ArrowLeft, Plus, Trash2, FolderOpen } from 'lucide-react';
import { StudyVaultFolder, StudyVaultLink } from '../types';

interface Props {
  isAdmin: boolean;
  loadVault: () => Promise<{ folders: StudyVaultFolder[]; links: StudyVaultLink[] }>;
  onCreateFolder: (name: string, description: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onCreateLink: (folderId: string, title: string, url: string) => Promise<void>;
  onDeleteLink: (id: string) => Promise<void>;
  onBack: () => void;
}

export const StudyVaultView: React.FC<Props> = ({
  isAdmin,
  loadVault,
  onCreateFolder,
  onDeleteFolder,
  onCreateLink,
  onDeleteLink,
  onBack,
}) => {
  const [folders, setFolders] = useState<StudyVaultFolder[]>([]);
  const [links, setLinks] = useState<StudyVaultLink[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<StudyVaultFolder | null>(null);
  const [loading, setLoading] = useState(true);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const refresh = async () => {
    setLoading(true);
    const data = await loadVault();
    setFolders(data.folders);
    setLinks(data.links);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim(), newFolderDesc.trim());
    setNewFolderName('');
    setNewFolderDesc('');
    refresh();
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
    const formattedUrl = newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`;
    await onCreateLink(selectedFolder.id, newLinkTitle.trim(), formattedUrl);
    setNewLinkTitle('');
    setNewLinkUrl('');
    refresh();
  };

  const currentLinks = selectedFolder ? links.filter((l) => l.folder_id === selectedFolder.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-16">
      <div className="flex items-center justify-between">
        <button
          onClick={() => (selectedFolder ? setSelectedFolder(null) : onBack())}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> {selectedFolder ? 'All Folders' : 'Home'}
        </button>
        <h1 className="text-base font-bold text-white">
          {selectedFolder ? selectedFolder.name : 'Study Vault'}
        </h1>
        <div className="w-16" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-400">लोड हो रहा है...</div>
      ) : !selectedFolder ? (
        <>
          {isAdmin && (
            <form onSubmit={handleAddFolder} className="space-y-2.5 rounded-2xl border border-indigo-500/30 bg-zinc-900 p-4">
              <div className="text-xs font-bold text-indigo-300">+ नया फ़ोल्डर जोड़ें (Admin)</div>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="फ़ोल्डर का नाम (जैसे: NCERT PDFs, Video Lectures)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
              <input
                type="text"
                value={newFolderDesc}
                onChange={(e) => setNewFolderDesc(e.target.value)}
                placeholder="संक्षिप्त विवरण (Optional)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" /> फ़ोल्डर बनाएँ
              </button>
            </form>
          )}

          {folders.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
              अभी कोई फ़ोल्डर नहीं जोड़ा गया है।
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {folders.map((folder) => {
                const count = links.filter((l) => l.folder_id === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder)}
                    className="group flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 transition hover:border-indigo-500/50 hover:bg-zinc-900"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                        <Folder className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-indigo-300">{folder.name}</h3>
                        <p className="text-xs text-zinc-400">
                          {folder.description ? `${folder.description} • ` : ''}
                          {count} Links
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFolder(folder.id).then(refresh);
                        }}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {isAdmin && (
            <form onSubmit={handleAddLink} className="space-y-2.5 rounded-2xl border border-emerald-500/30 bg-zinc-900 p-4">
              <div className="text-xs font-bold text-emerald-300">+ इस फ़ोल्डर में नया लिंक जोड़ें (Admin)</div>
              <input
                type="text"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="URL का नाम (जैसे: Physics Formula Sheet PDF)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
              <input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" /> लिंक जोड़ें
              </button>
            </form>
          )}

          {currentLinks.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
              इस फ़ोल्डर में अभी कोई लिंक नहीं है।
            </div>
          ) : (
            <div className="space-y-2.5">
              {currentLinks.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4"
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-white hover:text-emerald-300">
                        <span className="truncate">{item.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      </div>
                      <p className="truncate text-xs text-zinc-500">{item.url}</p>
                    </div>
                  </a>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onDeleteLink(item.id).then(refresh)}
                      className="ml-2 rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
