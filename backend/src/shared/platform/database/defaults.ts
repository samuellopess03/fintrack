export interface DefaultCategory {
  name: string
  color: string
  icon: string
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Alimentação", color: "#EF4444", icon: "utensils" },
  { name: "Transporte", color: "#F97316", icon: "car" },
  { name: "Saúde", color: "#22C55E", icon: "heart" },
  { name: "Educação", color: "#3B82F6", icon: "book" },
  { name: "Lazer", color: "#A855F7", icon: "gamepad" },
  { name: "Moradia", color: "#EC4899", icon: "home" },
  { name: "Salário", color: "#10B981", icon: "briefcase" },
  { name: "Investimentos", color: "#6366F1", icon: "trending-up" },
  { name: "Não categorizado", color: "#94A3B8", icon: "help-circle" },
]
