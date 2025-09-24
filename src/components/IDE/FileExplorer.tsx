import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronRight, ChevronDown, Folder, Plus, Trash2, RefreshCw, Upload, Download,
  FileText, FileCode, FileImage, FileType, Palette, Globe, Clipboard, Book,
  FolderOpen, Archive, Settings, Database, Key, Shield, File as FileIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { githubService, FileNode } from '@/services/githubService';
import { useToast } from '@/components/ui/use-toast';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FileExplorerProps {
  onFileSelect: (filePath: string) => void;
  selectedFile: string | null;
  onRefresh?: () => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  onFileSelect, 
  selectedFile, 
  onRefresh 
}) => {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creatingFile, setCreatingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadFiles = async (path: string = '') => {
    if (!githubService.isConfigured()) {
      return [];
    }

    setLoading(true);
    try {
      const fileTree = await githubService.getRepositoryTree(path);
      return fileTree;
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
      toast({
        title: "Erro",
        description: "Falha ao carregar arquivos do repositório",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadRootFiles = async () => {
    const rootFiles = await loadFiles();
    setFiles(rootFiles);
  };

  const loadDirContents = async (dirPath: string) => {
    const dirFiles = await loadFiles(dirPath);
    setFiles(prevFiles => updateFileTree(prevFiles, dirPath, dirFiles));
  };

  const updateFileTree = (files: FileNode[], dirPath: string, newFiles: FileNode[]): FileNode[] => {
    return files.map(file => {
      if (file.path === dirPath && file.type === 'dir') {
        return { ...file, children: newFiles };
      }
      if (file.children) {
        return { ...file, children: updateFileTree(file.children, dirPath, newFiles) };
      }
      return file;
    });
  };

  const toggleDirectory = async (dirPath: string) => {
    const isExpanded = expandedDirs.has(dirPath);
    
    if (isExpanded) {
      setExpandedDirs(prev => {
        const newSet = new Set(prev);
        newSet.delete(dirPath);
        return newSet;
      });
    } else {
      setExpandedDirs(prev => new Set(prev).add(dirPath));
      
      // Carrega o conteúdo do diretório se ainda não foi carregado
      const dirNode = findNodeByPath(files, dirPath);
      if (dirNode && !dirNode.children) {
        await loadDirContents(dirPath);
      }
    }
  };

  const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) {
        return node;
      }
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const handleCreateFile = async (dirPath: string = '') => {
    if (!newFileName.trim()) return;

    const fullPath = dirPath ? `${dirPath}/${newFileName}` : newFileName;
    
    try {
      const result = await githubService.createFile(
        fullPath,
        '// Novo arquivo criado via IDE\n',
        `Criar arquivo ${newFileName} via IDE`
      );
      
      if (result) {
        toast({
          title: "✅ Sucesso",
          description: `Arquivo ${newFileName} criado e enviado para o GitHub com timestamp`,
        });
        
        // Recarrega os arquivos
        await loadRootFiles();
        
        // Seleciona o arquivo recém-criado
        onFileSelect(fullPath);
      }
    } catch (error) {
      console.error('Erro detalhado ao criar arquivo:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "❌ Falha ao Criar",
        description: `Erro: ${errorMessage}. Verifique sua conexão e permissões do token GitHub.`,
        variant: "destructive",
      });
    } finally {
      setCreatingFile(null);
      setNewFileName('');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    
    try {
      const result = await githubService.deleteFile(filePath, `Deletar arquivo ${fileName} via IDE`);
      
      if (result) {
        toast({
          title: "✅ Sucesso",
          description: `Arquivo ${fileName} deletado do GitHub com timestamp`,
        });
        
        // Recarrega os arquivos
        await loadRootFiles();
      }
    } catch (error) {
      console.error('Erro detalhado ao deletar arquivo:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "❌ Falha ao Deletar",
        description: `Erro: ${errorMessage}. Verifique suas permissões do token GitHub.`,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    try {
      for (const file of Array.from(files)) {
        const content = await file.text();
        const result = await githubService.createFile(
          file.name,
          content,
          `Upload arquivo ${file.name} via IDE`
        );
        
        if (!result) {
          throw new Error(`Falha ao fazer upload do arquivo ${file.name}`);
        }
      }
      
      toast({
        title: "✅ Sucesso",
        description: `${files.length} arquivo(s) enviado(s) com sucesso`,
      });
      
      await loadRootFiles();
    } catch (error) {
      console.error('Erro no upload:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "❌ Falha no Upload",
        description: `Erro: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadFile = async (filePath: string) => {
    try {
      const content = await githubService.getFileContent(filePath);
      const fileName = filePath.split('/').pop() || filePath;
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Download Concluído",
        description: `Arquivo ${fileName} baixado com sucesso`,
      });
    } catch (error) {
      console.error('Erro no download:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "❌ Falha no Download",
        description: `Erro: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const handleDownloadFolder = async (folderPath: string) => {
    try {
      const folderFiles = await githubService.getRepositoryTree(folderPath);
      const folderName = folderPath.split('/').pop() || 'pasta';
      
      // Criar um zip com todos os arquivos da pasta
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      const addFilesToZip = async (files: FileNode[], basePath: string = '') => {
        for (const file of files) {
          if (file.type === 'file') {
            try {
              const content = await githubService.getFileContent(file.path);
              const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
              zip.file(relativePath, content);
            } catch (error) {
              console.warn(`Erro ao baixar arquivo ${file.path}:`, error);
            }
          } else if (file.type === 'dir' && file.children) {
            const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
            await addFilesToZip(file.children, relativePath);
          }
        }
      };
      
      await addFilesToZip(folderFiles);
      
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Download Concluído",
        description: `Pasta ${folderName} baixada como ZIP`,
      });
    } catch (error) {
      console.error('Erro no download da pasta:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "❌ Falha no Download",
        description: `Erro: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (fileName: string, isDirectory: boolean = false) => {
    if (isDirectory) {
      return FolderOpen;
    }
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'tsx':
      case 'jsx':
        return FileCode;
      case 'ts':
      case 'js':
        return FileCode;
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return Palette;
      case 'html':
      case 'htm':
        return Globe;
      case 'json':
        return Clipboard;
      case 'md':
      case 'markdown':
        return Book;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        return FileImage;
      case 'pdf':
        return FileText;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return Archive;
      case 'env':
      case 'config':
        return Settings;
      case 'sql':
      case 'db':
      case 'sqlite':
        return Database;
      case 'key':
      case 'pem':
      case 'cert':
        return Key;
      case 'lock':
        return Shield;
      default:
        return FileText;
    }
  };

  const renderFileNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;
    
    return (
      <div key={node.path}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={`flex items-center gap-2 px-2 py-1.5 mx-1 my-0.5 rounded-md cursor-pointer transition-all duration-200 group ${
                isSelected 
                  ? 'bg-primary/15 text-primary border-l-2 border-primary shadow-sm' 
                  : 'hover:bg-muted/60 hover:text-foreground'
              }`}
              style={{ paddingLeft: `${level * 16 + 12}px` }}
              onClick={() => {
                if (node.type === 'file') {
                  onFileSelect(node.path);
                } else {
                  toggleDirectory(node.path);
                }
              }}
            >
              {node.type === 'dir' && (
                <>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                  <Folder className={`h-4 w-4 transition-colors ${
                    isExpanded ? 'text-primary' : 'text-blue-500'
                  }`} />
                </>
              )}
              
              {node.type === 'file' && (
                <>
                  <span className="w-3.5" />
                  {(() => {
                    const IconComponent = getFileIcon(node.name);
                    return <IconComponent className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />;
                  })()}
                </>
              )}
              
              <span className="text-sm truncate flex-1 group-hover:text-foreground transition-colors">
                {node.name}
              </span>
            </div>
          </ContextMenuTrigger>
          
          <ContextMenuContent>
            {node.type === 'dir' && (
              <>
                <ContextMenuItem onClick={() => setCreatingFile(node.path)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo arquivo
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleDownloadFolder(node.path)}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar pasta
                </ContextMenuItem>
              </>
            )}
            
            {node.type === 'file' && (
              <>
                <ContextMenuItem onClick={() => handleDownloadFile(node.path)}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar arquivo
                </ContextMenuItem>
                <ContextMenuItem 
                  onClick={() => handleDeleteFile(node.path)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar arquivo
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        
        {/* Input para criar novo arquivo */}
        {creatingFile === node.path && (
          <div 
            className="flex items-center gap-2 px-2 py-1.5 mx-1 my-0.5 bg-muted/40 rounded-md border border-dashed border-primary/30"
            style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
          >
            <span className="w-3.5" />
            <FileIcon className="h-4 w-4 text-primary/70" />
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="nome-do-arquivo.tsx"
              className="h-7 text-xs bg-background/80 border-primary/30 focus:border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFile(node.path);
                } else if (e.key === 'Escape') {
                  setCreatingFile(null);
                  setNewFileName('');
                }
              }}
              onBlur={() => {
                if (newFileName.trim()) {
                  handleCreateFile(node.path);
                } else {
                  setCreatingFile(null);
                }
              }}
            />
          </div>
        )}
        
        {/* Renderiza filhos se o diretório estiver expandido */}
        {node.type === 'dir' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderFileNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (githubService.isConfigured()) {
      loadRootFiles();
    }
  }, []);

  if (!githubService.isConfigured()) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-muted/20 blur-xl rounded-full"></div>
            <Folder className="h-12 w-12 mx-auto text-muted-foreground/40 relative z-10" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">GitHub não configurado</p>
            <p className="text-xs text-muted-foreground/70">Configure o GitHub para ver os arquivos</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10">
        <span className="text-sm font-semibold text-foreground">Explorador</span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
            title="Fazer upload de arquivos"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCreatingFile('')}
            className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
            title="Novo arquivo"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              loadRootFiles();
              onRefresh?.();
            }}
            disabled={loading}
            className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      {/* Input oculto para upload de arquivos */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept="*/*"
      />
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-gradient-to-b from-transparent to-muted/5 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20">
        {/* Input para criar arquivo na raiz */}
        {creatingFile === '' && (
          <div className="flex items-center gap-2 px-2 py-1.5 mx-1 my-1 bg-muted/40 rounded-md border border-dashed border-primary/30">
            <span className="w-3.5" />
            <FileIcon className="h-4 w-4 text-primary/70" />
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="nome-do-arquivo.tsx"
              className="h-7 text-xs bg-background/80 border-primary/30 focus:border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFile('');
                } else if (e.key === 'Escape') {
                  setCreatingFile(null);
                  setNewFileName('');
                }
              }}
              onBlur={() => {
                if (newFileName.trim()) {
                  handleCreateFile('');
                } else {
                  setCreatingFile(null);
                }
              }}
            />
          </div>
        )}
        
        {loading && files.length === 0 ? (
          <div className="p-6 text-center">
            <div className="space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary/60" />
              <p className="text-sm text-muted-foreground">Carregando arquivos...</p>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="p-6 text-center">
            <div className="space-y-3">
              <Folder className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum arquivo encontrado</p>
            </div>
          </div>
        ) : (
          <div className="py-1">
            {files.map(node => renderFileNode(node))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;