import { ROLES } from "../../lib/roles";

export function RoleSelector({ value, onChange, disabled }) {
  return (
    <div className="role-selector">
      <label htmlFor="role-mode" className="role-selector-label">Role Mode</label>
      <select
        id="role-mode"
        className="role-selector-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {ROLES.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </select>
    </div>
  );
}
