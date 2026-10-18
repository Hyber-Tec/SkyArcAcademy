import { StudentsList } from "@/features/students/StudentsList";

/** Every student, from More: the coach's way in (their tabs keep Availability where the office's have Students). */
export default function MoreStudentsScreen() {
  return <StudentsList titled={false} />;
}
