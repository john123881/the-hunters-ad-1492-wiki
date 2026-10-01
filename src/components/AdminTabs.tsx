import { NavLink } from 'react-router-dom';

export function AdminTabs(){
  return <nav className="admin-tabs" aria-label="管理功能">
    <NavLink end to="/admin">戰役管理</NavLink>
    <NavLink to="/admin/activity">操作紀錄</NavLink>
  </nav>;
}
