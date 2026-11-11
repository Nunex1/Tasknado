import { BookOpen, Briefcase, Code2, Folder, Wallet } from "lucide-react";

const icons: Record<string, typeof Folder> = {
  folder: Folder,
  briefcase: Briefcase,
  book: BookOpen,
  wallet: Wallet,
  code: Code2,
};

/** The icon chosen in the workspace form; unknown values fall back to a folder. */
export function WorkspaceIcon({
  icon,
  size = 16,
}: {
  icon: string;
  size?: number;
}) {
  const Icon = icons[icon] ?? Folder;
  return <Icon size={size} aria-hidden="true" />;
}
