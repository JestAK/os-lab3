const RANDOM_ALGORITHM = false;
const AMOUNT_OF_PROCESSES = 3;
const TOTAL_TICKS = 1000;
const PHYSICAL_MEMORY_PAGES = 32;
const WORKING_SET_SIZE = 12;
const MAX_VIRTUAL_PAGES = 48;
const WORKING_SET_CHANGE_INTERVAL = 50;

class RandomAlgo {
    pick(pages) {
        const index = Math.floor(Math.random() * pages.length);
        return pages[index];
    }
}

class WSClock {
    constructor() {
        this.hand = 0;
    }

    pick(pages) {
        const n = pages.length;

        while (true) {
            const page = pages[this.hand];

            const proc = page.owner;
            const vpn = page.vpn;
            const vp = proc.virtualSpace.virtualPages[vpn];

            console.log(
                `WSClock: check PPN ${this.hand} (R=${vp.R}, M=${vp.M})`
            );

            // R = true
            if (vp.R) {
                vp.R = false;
                this.hand = (this.hand + 1) % n;
                continue;
            }

            // R = false M = true
            if (vp.M) {
                console.log(`WSClock: write-back simulated for Process ${proc.pid}, VPN ${vpn}`);
                vp.M = false;
                this.hand = (this.hand + 1) % n;
                continue;
            }

            // R = false, M = false
            const victim = page;
            console.log(
                `WSClock: selected victim PPN ${this.hand}`
            );

            this.hand = (this.hand + 1) % n;
            return victim;
        }
    }
}

class Kernel {
    constructor() {
        this.physicalMemory = new PhysicalSpace();
        this.pageFaults = 0;
        this.alghorithm = RANDOM_ALGORITHM ? new RandomAlgo() : new WSClock();
    }

    handlePageFault(proc, vpn) {
        this.pageFaults++;
        console.log(`Handling page fault for Process ${proc.pid}, VPN ${vpn}`);

        // Find free physical page
        let page = this.physicalMemory.physicalPages.find(p => p.owner === null);


        if (!page) {
            console.log("No free physical pages, selecting a page to evict.");

            // Pick victim page
            page = this.alghorithm.pick(this.physicalMemory.physicalPages);

            const oldProc = page.owner;
            const oldVPN = page.vpn;

            console.log(`Evicting: Process ${oldProc.pid}, VPN ${oldVPN}`);

            // Deleting victim from physical memory
            const oldVP = oldProc.virtualSpace.virtualPages[oldVPN];
            oldVP.P = false;
            oldVP.PPN = null;
            oldVP.R = false;
            oldVP.M = false;
        }

        // Assign new page
        page.owner = proc;
        page.vpn = vpn;

        const vp = proc.virtualSpace.virtualPages[vpn];
        vp.P = true;
        vp.PPN = this.physicalMemory.physicalPages.indexOf(page);
        vp.R = false;
        vp.M = false;

        console.log(`Mapped: Process ${proc.pid}, VPN ${vpn} → PPN ${vp.PPN}`);
    }
}

class MMU {
    constructor(kernel) {
        this.kernel = kernel;
        this.countAccesses = 0;
    }

    access(proc, vpn, write) {
        this.countAccesses++;
        const page = proc.virtualSpace.virtualPages[vpn];

        if (!page.P) {
            console.log(`PAGE FAULT: Process ${proc.pid}, VPN ${vpn}`);
            this.kernel.handlePageFault(proc, vpn);

            console.log(`MMU: VPN ${vpn} → PPN ${proc.virtualSpace.virtualPages[vpn].PPN} (after page fault)`);
        }

        console.log(`MMU: VPN ${vpn} → PPN ${page.PPN} (physical memory access)`);

        page.R = true;
        if (write) {
            page.M = true;
        }
    }
}

class CPU {
    constructor() {
        this.processes = [];
        this.current = 0;
        this.mmu = new MMU(new Kernel());
    }

    tick() {
        if (this.processes.length === 0) {
            console.log("No processes left. CPU idle.");
            return;
        }

        const proc = this.processes[this.current];

        proc.ttl--;

        if (proc.ttl < 1) {
            console.log(`Process ${proc.pid} terminated.`);
            this.processes.splice(this.current, 1);

            // Index correction
            if (this.current >= this.processes.length) {
                this.current = 0;
            }
            return;
        }

        const { vpn, write } = proc.work();

        this.mmu.access(proc, vpn, write)

        this.current = (this.current + 1) % this.processes.length;
    }

    getProcesses(processes) {
        this.processes = processes;
    }

    runSystemProcesses() {
        console.log("Running system processes...");
    }
}

class PhysicalPage {
    constructor() {
        this.owner = null; // Process that owns this page
        this.vpn = null; // Virtual Page Number
    }
}

class PhysicalSpace {
    constructor() {
        this.size = PHYSICAL_MEMORY_PAGES;
        this.physicalPages = Array.from({ length: this.size }, () => new PhysicalPage());
    }
}

class VirtualPage {
    constructor() {
        this.P = false; // Present bit
        this.R = false; // Referenced bit
        this.M = false; // Modified bit
        this.PPN = null; // Physical Page Number
    }
}

class VirtualSpace {
    constructor() {
        this.size =  Math.floor(Math.random() * MAX_VIRTUAL_PAGES) + 1; // Number of virtual pages
        this.virtualPages = Array.from({ length: this.size }, () => new VirtualPage());
    }


}

class Process {
    constructor(id) {
        this.pid = id;
        this.ttl = Math.floor(Math.random() * TOTAL_TICKS) + 1; // Time to live in seconds
        this.virtualSpace = new VirtualSpace();
        this.workingSetSize = WORKING_SET_SIZE;
        this.workingSet = this.generateWorkingSet();
    }

    generateWorkingSet() {
        const set = new Set();

        // If virtual space size less than working set size, include all pages
        if (this.virtualSpace.size <= this.workingSetSize) {
            for (let i = 0; i < this.virtualSpace.size; i++) {
                set.add(i);
            }
            return Array.from(set);
        }
        while (set.size < this.workingSetSize) {
            const page = Math.floor(Math.random() * this.virtualSpace.size);
            set.add(page);
        }
        return Array.from(set);
    }

    updateWorkingSet() {
        this.workingSet = this.generateWorkingSet();
        console.log(`Process ${this.pid} updated working set: [${this.workingSet.join(", ")}]`);
    }

    work() {
        // Simulate page access
        const accessPage = Math.random() < 0.9
            ? this.workingSet[Math.floor(Math.random() * this.workingSet.length)]
            : Math.floor(Math.random() * this.virtualSpace.size);

        const write = Math.random() < 0.3;

        console.log(`Process accessing page ${accessPage} ${write ? '(write)' : '(read)'}. TTL left: ${this.ttl}s`);

        return { vpn: accessPage, write };
    }
}


// ---------- Simulation ----------
const cpu = new CPU();
const processes = [];

// Simulate process creation
for (let i = 0; i < AMOUNT_OF_PROCESSES; i++) {
    const p = new Process(i);
    processes.push(p);
    console.log(`Process ${i} created with TTL ${p.ttl} seconds.`);
}

cpu.getProcesses(processes)

for (let tick = 0; tick <= TOTAL_TICKS; tick++) {
    if (tick % WORKING_SET_CHANGE_INTERVAL === 0) {
        for (const p of cpu.processes) {
            p.updateWorkingSet();
        }
    }

    console.log(`Tick ${tick}: Simulating process execution...`);
    if (tick % 10 === 0) {
        cpu.runSystemProcesses();
    } else {
        cpu.tick();
    }
    console.log("--------------------------");
}

// ---------- Report ----------
console.log("=== SIMULATION COMPLETE ===");
console.log(`Total page faults handled: ${cpu.mmu.kernel.pageFaults}`);
console.log(`Fault rate: ${(cpu.mmu.kernel.pageFaults / cpu.mmu.countAccesses).toFixed(3)}`);