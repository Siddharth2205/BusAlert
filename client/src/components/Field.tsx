export function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 900, fontSize: 13 }}>{props.label}</div>
      {props.children}
    </div>
  );
}
