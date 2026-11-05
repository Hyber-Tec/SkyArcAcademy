import { cn } from "cn"
import { LuLoaderCircle } from "react-icons/lu"
import { useT } from "@/lib/lang"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useT()
  return (
    <LuLoaderCircle data-slot="spinner" role="status" aria-label={t("Loading", "불러오는 중")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
