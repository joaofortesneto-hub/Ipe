import React, { useState, useEffect, useMemo } from "react";
import { 
  Users, 
  Calendar, 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  Building2, 
  CreditCard, 
  Info,
  Download,
  Search
} from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths, 
  isToday,
  parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { motion, AnimatePresence } from "motion/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Staff, Attendance, PaymentSummary, Receiver } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"dashboard" | "staff" | "receivers" | "attendance" | "payments">("dashboard");
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isReceiverModalOpen, setIsReceiverModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingReceiver, setEditingReceiver] = useState<Receiver | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch data
  const fetchData = async () => {
    try {
      const [staffRes, receiversRes] = await Promise.all([
        fetch("/api/staff"),
        fetch("/api/receivers")
      ]);
      
      const [staffData, receiversData] = await Promise.all([
        staffRes.json(),
        receiversRes.json()
      ]);
      
      setStaff(staffData);
      setReceivers(receiversData);

      const monthStr = format(currentMonth, "yyyy-MM");
      const attendanceRes = await fetch(`/api/attendance?month=${monthStr}`);
      const attendanceData = await attendanceRes.json();
      setAttendance(attendanceData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  // Calculations
  const summaries = useMemo(() => {
    return staff.map(s => {
      const daysWorked = attendance.filter(a => a.staff_id === s.id).length;
      const hourlyRate = s.hours_per_day > 0 ? s.daily_rate / s.hours_per_day : 0;
      const totalDaily = daysWorked * s.daily_rate;
      const totalMeal = daysWorked * s.meal_allowance;
      const totalToPay = totalDaily + totalMeal;
      const splitAmount = totalToPay / 3;

      return {
        staffId: s.id,
        name: s.name,
        daysWorked,
        hourlyRate,
        totalDaily,
        totalMeal,
        totalToPay,
        splitAmount
      } as PaymentSummary;
    });
  }, [staff, attendance]);

  const totalMonthly = summaries.reduce((acc, s) => acc + s.totalToPay, 0);
  const splitPerCompany = totalMonthly / 3;

  const handleToggleAttendance = async (staffId: number, date: string) => {
    const exists = attendance.find(a => a.staff_id === staffId && a.date === date);
    if (exists) {
      await fetch("/api/attendance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, date })
      });
    } else {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, date })
      });
    }
    fetchData();
  };

  const handleSaveStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());
      
      const payload = {
        ...data,
        daily_rate: Number(data.daily_rate),
        hours_per_day: Number(data.hours_per_day),
        meal_allowance: Number(data.meal_allowance),
        receiver_id: data.receiver_id ? Number(data.receiver_id) : null
      };

      if (editingStaff) {
        await fetch(`/api/staff/${editingStaff.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      
      setIsStaffModalOpen(false);
      setEditingStaff(null);
      fetchData();
    } catch (error) {
      console.error("Error saving staff:", error);
      alert("Erro ao salvar funcionário.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReceiver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());

      if (editingReceiver) {
        await fetch(`/api/receivers/${editingReceiver.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      } else {
        await fetch("/api/receivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      }
      
      setIsReceiverModalOpen(false);
      setEditingReceiver(null);
      fetchData();
    } catch (error) {
      console.error("Error saving receiver:", error);
      alert("Erro ao salvar recebedor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReceiver = async (id: number) => {
    if (confirm("Tem certeza que deseja excluir este recebedor?")) {
      try {
        console.log("Tentando excluir recebedor ID:", id);
        const response = await fetch(`/api/receivers/${id}`, { method: "DELETE" });
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || "Erro ao excluir");
        }
        
        console.log("Exclusão bem-sucedida:", result);
        fetchData();
      } catch (error) {
        console.error("Erro na exclusão:", error);
        alert(`Não foi possível excluir o recebedor: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
      }
    }
  };

  const handleDeleteStaff = async (id: number) => {
    if (confirm("Tem certeza que deseja excluir este funcionário?")) {
      await fetch(`/api/staff/${id}`, { method: "DELETE" });
      fetchData();
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`Relatório de Pagamentos - ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, 14, 22);
    
    // Prepare table data
    const tableData: any[] = [];
    let totalDays = 0;
    let totalHours = 0;
    let totalDailyVal = 0;
    let totalMealVal = 0;
    let totalToPayVal = 0;

    // Sort attendance by date
    const sortedAttendance = [...attendance].sort((a, b) => a.date.localeCompare(b.date));

    sortedAttendance.forEach(att => {
      const s = staff.find(st => st.id === att.staff_id);
      if (!s) return;

      const hourlyRate = s.hours_per_day > 0 ? s.daily_rate / s.hours_per_day : 0;
      
      tableData.push([
        format(parseISO(att.date), 'dd/MM/yyyy'),
        s.hours_per_day.toString(),
        `R$ ${hourlyRate.toFixed(2)}`,
        `R$ ${s.daily_rate.toFixed(2)}`,
        `R$ ${s.meal_allowance.toFixed(2)}`,
        s.name,
        s.receiver_name || "Próprio"
      ]);

      totalDays += 1;
      totalHours += s.hours_per_day;
      totalDailyVal += s.daily_rate;
      totalMealVal += s.meal_allowance;
      totalToPayVal += (s.daily_rate + s.meal_allowance);
    });

    autoTable(doc, {
      startY: 30,
      head: [['Data', 'Horas', 'Vlr Hora', 'Vlr Diária', 'Refeição', 'Funcionário', 'Recebedor']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;

    // Totals section
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont("helvetica", "bold");
    doc.text(`RESUMO GERAL`, 14, finalY + 15);
    
    const totals = [
      [`Total de Dias Trabalhados:`, `${totalDays}`],
      [`Total de Horas Trabalhadas:`, `${totalHours.toFixed(1)}h`],
      [`Valor Total das Diárias:`, `R$ ${totalDailyVal.toFixed(2)}`],
      [`Valor Total das Refeições:`, `R$ ${totalMealVal.toFixed(2)}`],
      [`VALOR TOTAL A PAGAR:`, `R$ ${totalToPayVal.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: finalY + 20,
      body: totals,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' }
      },
    });

    doc.save(`relatorio-seguranca-${format(currentMonth, 'yyyy-MM')}.pdf`);
  };

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 z-40 hidden lg:block">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
            <Building2 size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Ipê Segurança</h1>
        </div>

        <div className="space-y-2">
          <NavItem 
            active={activeTab === "dashboard"} 
            onClick={() => setActiveTab("dashboard")}
            icon={<Info size={20} />}
            label="Dashboard"
          />
          <NavItem 
            active={activeTab === "staff"} 
            onClick={() => setActiveTab("staff")}
            icon={<Users size={20} />}
            label="Funcionários"
          />
          <NavItem 
            active={activeTab === "receivers"} 
            onClick={() => setActiveTab("receivers")}
            icon={<CreditCard size={20} />}
            label="Recebedores"
          />
          <NavItem 
            active={activeTab === "attendance"} 
            onClick={() => setActiveTab("attendance")}
            icon={<Calendar size={20} />}
            label="Frequência"
          />
          <NavItem 
            active={activeTab === "payments"} 
            onClick={() => setActiveTab("payments")}
            icon={<DollarSign size={20} />}
            label="Pagamentos"
          />
        </div>

        <div className="absolute bottom-8 left-6 right-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
          <p className="text-xs text-emerald-700 font-medium mb-1">Total Mensal</p>
          <p className="text-lg font-bold text-emerald-900">
            {totalMonthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </nav>

      {/* Mobile Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-4 z-50">
        <button onClick={() => setActiveTab("dashboard")} className={cn("p-2 rounded-lg", activeTab === "dashboard" ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}><Info size={24} /></button>
        <button onClick={() => setActiveTab("staff")} className={cn("p-2 rounded-lg", activeTab === "staff" ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}><Users size={24} /></button>
        <button onClick={() => setActiveTab("receivers")} className={cn("p-2 rounded-lg", activeTab === "receivers" ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}><CreditCard size={24} /></button>
        <button onClick={() => setActiveTab("attendance")} className={cn("p-2 rounded-lg", activeTab === "attendance" ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}><Calendar size={24} /></button>
        <button onClick={() => setActiveTab("payments")} className={cn("p-2 rounded-lg", activeTab === "payments" ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}><DollarSign size={24} /></button>
      </div>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 lg:p-10 pb-24 lg:pb-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {activeTab === "dashboard" && "Visão Geral"}
              {activeTab === "staff" && "Gestão de Funcionários"}
              {activeTab === "receivers" && "Gestão de Recebedores"}
              {activeTab === "attendance" && "Controle de Frequência"}
              {activeTab === "payments" && "Relatório de Pagamentos"}
            </h2>
            <p className="text-slate-500 text-sm">
              {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 font-medium text-sm min-w-[140px] text-center">
              {format(currentMonth, "MMM yyyy", { locale: ptBR })}
            </span>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard 
                  title="Ipê Química" 
                  amount={splitPerCompany} 
                  color="bg-blue-600"
                  icon={<Building2 size={20} />}
                />
                <SummaryCard 
                  title="Ipê Piauí" 
                  amount={splitPerCompany} 
                  color="bg-indigo-600"
                  icon={<Building2 size={20} />}
                />
                <SummaryCard 
                  title="Ipê Maranhão" 
                  amount={splitPerCompany} 
                  color="bg-violet-600"
                  icon={<Building2 size={20} />}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <DollarSign size={20} className="text-emerald-600" />
                    Distribuição de Pagamentos
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaries}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip 
                          cursor={{ fill: '#F1F5F9' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="totalToPay" radius={[4, 4, 0, 0]}>
                          {summaries.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10B981' : '#34D399'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Users size={20} className="text-emerald-600" />
                    Últimas Atividades
                  </h3>
                  <div className="space-y-4">
                    {staff.slice(0, 5).map(s => {
                      const summary = summaries.find(sum => sum.staffId === s.id);
                      return (
                        <div key={s.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600">
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{s.name}</p>
                              <p className="text-xs text-slate-500">{summary?.daysWorked} dias trabalhados</p>
                            </div>
                          </div>
                          <p className="font-bold text-emerald-600">
                            {summary?.totalToPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      );
                    })}
                    {staff.length === 0 && (
                      <div className="text-center py-10 text-slate-400">
                        Nenhum funcionário cadastrado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "staff" && (
            <motion.div 
              key="staff"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar funcionário..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => { setEditingStaff(null); setIsStaffModalOpen(true); }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Plus size={20} />
                  Novo Funcionário
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredStaff.map(s => (
                  <div key={s.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-bold text-xl">
                        {s.name.charAt(0)}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingStaff(s); setIsStaffModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteStaff(s.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <h4 className="font-bold text-lg mb-1">{s.name}</h4>
                    <p className="text-slate-500 text-sm mb-1 flex items-center gap-1">
                      <Building2 size={14} />
                      {s.role || "Sem cargo"}
                    </p>
                    <p className="text-slate-500 text-sm mb-4 flex items-center gap-1">
                      <Calendar size={14} />
                      Turno: {s.shift || "Não definido"}
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <div className="col-span-2 mb-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Recebedor</p>
                        <p className="font-bold text-slate-700 truncate">{s.receiver_name || "Próprio"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Diária</p>
                        <p className="font-bold text-slate-700">R$ {s.daily_rate.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Refeição</p>
                        <p className="font-bold text-slate-700">R$ {s.meal_allowance.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "receivers" && (
            <motion.div 
              key="receivers"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar recebedor..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => { setEditingReceiver(null); setIsReceiverModalOpen(true); }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Plus size={20} />
                  Novo Recebedor
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {receivers.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase())).map(r => (
                  <div key={r.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center font-bold text-xl">
                        {r.name.charAt(0)}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingReceiver(r); setIsReceiverModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteReceiver(r.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <h4 className="font-bold text-lg mb-1">{r.name}</h4>
                    <p className="text-slate-500 text-sm mb-4 flex items-center gap-1">
                      <CreditCard size={14} />
                      PIX: {r.pix_key || "Não informado"}
                    </p>
                    
                    <div className="space-y-2 pt-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500"><span className="font-bold uppercase text-[10px] text-slate-400 mr-2">Banco:</span> {r.bank}</p>
                      <p className="text-xs text-slate-500"><span className="font-bold uppercase text-[10px] text-slate-400 mr-2">Agência:</span> {r.agency}</p>
                      <p className="text-xs text-slate-500"><span className="font-bold uppercase text-[10px] text-slate-400 mr-2">CPF:</span> {r.cpf}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "attendance" && (
            <motion.div 
              key="attendance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-bottom border-slate-200">
                      <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 min-w-[200px]">
                        Funcionário
                      </th>
                      {eachDayOfInterval({
                        start: startOfMonth(currentMonth),
                        end: endOfMonth(currentMonth)
                      }).map(day => (
                        <th key={day.toString()} className={cn(
                          "p-2 text-center text-[10px] font-bold min-w-[40px]",
                          isToday(day) ? "text-emerald-600" : "text-slate-400"
                        )}>
                          <div>{format(day, "EEE", { locale: ptBR })}</div>
                          <div className={cn(
                            "w-7 h-7 mx-auto flex items-center justify-center rounded-full mt-1",
                            isToday(day) && "bg-emerald-600 text-white"
                          )}>
                            {format(day, "d")}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="p-4 sticky left-0 bg-white z-10 border-r border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-600">
                              {s.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-sm truncate max-w-[150px]">{s.name}</span>
                          </div>
                        </td>
                        {eachDayOfInterval({
                          start: startOfMonth(currentMonth),
                          end: endOfMonth(currentMonth)
                        }).map(day => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const isMarked = attendance.some(a => a.staff_id === s.id && a.date === dateStr);
                          return (
                            <td key={dateStr} className="p-1 text-center">
                              <button 
                                onClick={() => handleToggleAttendance(s.id, dateStr)}
                                className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                  isMarked 
                                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" 
                                    : "bg-slate-50 text-transparent hover:text-slate-300 hover:bg-slate-100"
                                )}
                              >
                                <Check size={16} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "payments" && (
            <motion.div 
              key="payments"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-lg">Relatório Detalhado</h3>
                  <button 
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 text-emerald-600 font-bold text-sm hover:bg-emerald-50 px-4 py-2 rounded-xl transition-all"
                  >
                    <Download size={18} />
                    Exportar PDF
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="p-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Funcionário</th>
                        <th className="p-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Dias</th>
                        <th className="p-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Diárias</th>
                        <th className="p-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Refeição</th>
                        <th className="p-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Total</th>
                        <th className="p-4 text-right text-xs font-bold text-emerald-600 uppercase tracking-wider">Por Empresa (1/3)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map(s => (
                        <tr key={s.staffId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-sm">{s.name}</p>
                            <p className="text-[10px] text-slate-400">Recebedor: {staff.find(st => st.id === s.staffId)?.receiver_name || "Próprio"}</p>
                          </td>
                          <td className="p-4 text-center font-semibold">{s.daysWorked}</td>
                          <td className="p-4 text-right text-sm">R$ {s.totalDaily.toFixed(2)}</td>
                          <td className="p-4 text-right text-sm">R$ {s.totalMeal.toFixed(2)}</td>
                          <td className="p-4 text-right font-bold text-slate-900">R$ {s.totalToPay.toFixed(2)}</td>
                          <td className="p-4 text-right font-bold text-emerald-600">R$ {s.splitAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-emerald-50/50">
                        <td colSpan={4} className="p-4 text-right font-bold text-emerald-900">TOTAL GERAL</td>
                        <td className="p-4 text-right font-black text-emerald-900">
                          {totalMonthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="p-4 text-right font-black text-emerald-600">
                          {splitPerCompany.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <CompanySplitCard name="Ipê Química" amount={splitPerCompany} />
                <CompanySplitCard name="Ipê Piauí" amount={splitPerCompany} />
                <CompanySplitCard name="Ipê Maranhão" amount={splitPerCompany} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Staff Modal */}
      <AnimatePresence>
        {isStaffModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStaffModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold">{editingStaff ? "Editar Funcionário" : "Novo Funcionário"}</h3>
                <button onClick={() => setIsStaffModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveStaff} className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome Completo</label>
                    <input name="name" defaultValue={editingStaff?.name} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargo</label>
                    <input name="role" defaultValue={editingStaff?.role} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Turno</label>
                    <input name="shift" defaultValue={editingStaff?.shift} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recebedor do Pagamento</label>
                    <select name="receiver_id" defaultValue={editingStaff?.receiver_id || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none">
                      <option value="">Próprio Funcionário</option>
                      {receivers.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor da Diária (R$)</label>
                    <input type="number" step="0.01" name="daily_rate" defaultValue={editingStaff?.daily_rate} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Horas por Dia</label>
                    <input type="number" step="0.5" name="hours_per_day" defaultValue={editingStaff?.hours_per_day || 8} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor Alimentação (R$)</label>
                    <input type="number" step="0.01" name="meal_allowance" defaultValue={editingStaff?.meal_allowance} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 bg-white shrink-0 sticky bottom-0">
                  <button type="button" onClick={() => setIsStaffModalOpen(false)} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancelar</button>
                  <button type="submit" disabled={isSaving} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20">
                    {isSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receiver Modal */}
      <AnimatePresence>
        {isReceiverModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReceiverModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold">{editingReceiver ? "Editar Recebedor" : "Novo Recebedor"}</h3>
                <button onClick={() => setIsReceiverModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveReceiver} className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Recebedor</label>
                    <input name="name" defaultValue={editingReceiver?.name} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CPF</label>
                    <input name="cpf" defaultValue={editingReceiver?.cpf} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Banco</label>
                    <input name="bank" defaultValue={editingReceiver?.bank} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Agência</label>
                    <input name="agency" defaultValue={editingReceiver?.agency} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Beneficiário</label>
                    <input name="beneficiary_name" defaultValue={editingReceiver?.beneficiary_name} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chave PIX</label>
                    <input name="pix_key" defaultValue={editingReceiver?.pix_key} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 bg-white shrink-0 sticky bottom-0">
                  <button type="button" onClick={() => setIsReceiverModalOpen(false)} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancelar</button>
                  <button type="submit" disabled={isSaving} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20">
                    {isSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all",
        active 
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SummaryCard({ title, amount, color, icon }: { title: string, amount: number, color: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
      <div className={cn("absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 group-hover:scale-110 transition-transform", color)} />
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white", color)}>
          {icon}
        </div>
        <h4 className="font-bold text-slate-500 text-sm uppercase tracking-wider">{title}</h4>
      </div>
      <p className="text-2xl font-black text-slate-900">
        {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>
      <p className="text-xs text-slate-400 mt-1">Cota mensal por empresa</p>
    </div>
  );
}

function CompanySplitCard({ name, amount }: { name: string, amount: number }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
          <Building2 size={16} />
        </div>
        <h4 className="font-bold text-slate-700">{name}</h4>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] uppercase font-bold text-slate-400">Total a Pagar</p>
        <p className="text-xl font-black text-emerald-600">
          {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      </div>
    </div>
  );
}
