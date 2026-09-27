# Test data — seven months for two businesses

`backend/scripts/seed-test-data.sql` fills the development database with seven
months of realistic trading for the two businesses the owner account holds, so
Reports, exports, payroll and every role's screens have something real to show.

It is written so that the net profit is **exactly** what was asked for, every
month:

| Business | Measured at | Net profit, every month |
| --- | --- | --- |
| **Puma thindi** | the whole business | **₹40,000** |
| **Shriman amrutulya** | its first branch, Branch-1 | **₹18,000** |

"Seven months" means this month and the six before it. On 27 September 2026 that
is March to September 2026. The window moves with the date the script is run.

---

## Before you run it

- **Development database only** (`buisnessops` on this machine). Never run it
  against the hosted database behind the release APK.
- The accounts it acts as must already exist, and they do:

  | Login | Role | Where |
  | --- | --- | --- |
  | vatsaltailor178@gmail.com | Owner | both businesses |
  | hari@yopmail.com | Cashier | Puma thindi, Branch 1 |
  | deep@yopmail.com | Cashier | Puma thindi, Branch-2 |
  | manos@yopmail.com | Warehouse desk | Puma thindi (Office) |
  | ravindra@yopmail.com | Delivery agent | Puma thindi |
  | ravindra1@yopmail.com | Delivery agent | Puma thindi |

  Nobody is looked up by any email except the owner's. Cashiers, the desk and
  the agents are found through their memberships, so someone added later is
  picked up the same way.
- The servers can stay running. The app reads the new rows straight away: pull
  down to refresh, or switch tabs.

## Running it

1. Open the file in your query tool, connected to `buisnessops`:
   - **pgAdmin**: Query Tool → Open File → **Execute script (F5)**.
   - **DBeaver**: open the file → **Execute script (Alt+X)**, not "Execute
     statement". The file is two statements and both have to run.
   - **psql**: `\i backend/scripts/seed-test-data.sql`.
2. Wait about **30 seconds**.
3. Read the results:
   - **Messages / Output** has one line per business, for example
     `Puma thindi: 23904 counter orders, 128 supply orders, 633 expenses, 49 payslips, 1273 attendance days`.
   - **The result grid** has one row per business per month. Check the
     `business_net_profit` column: 40000 on every Puma thindi row. Then check
     `branch_net_profit`: `Branch-1 18000.00` on every Shriman amrutulya row.

The first part runs as a single unit: if anything fails, nothing is written and
the error says why. Examples are "owns no business whose name matches", or a
month that did not land on its target.

## How the figures are reached

Net profit is computed exactly as `analytics.service.js` computes it for the
Reports tab:

- **A branch's figure:** customer sales − expenses − raw material it ordered
  from the warehouse − wages.
- **The business's figure:** customer sales − expenses − wages, across every
  branch. Raw material is **not** subtracted here, because money a shop pays its
  own warehouse never leaves the business.

The script fills in expenses and payroll first, then sizes the counter sales to
reach 95% of what the month needs. It then adds one **"Catering order"** per shop
per month that makes up the rest to the paisa: on the 20th at Branch 1 and on
the 13th at Branch-2, each about ₹4,000–15,000. For Puma thindi the correction is
split between the two shops in the same proportion as their sales, so neither
shop's own figure jumps about. Finally the script re-measures every month the
way Reports does, and it refuses to commit if any month is off by even a paisa.

If you had already sold more by hand than a month needs, that month gets a
**"Miscellaneous"** expense instead of a catering order. In practice this does not
happen.

### Why Puma thindi's branches do not add up to ₹40,000

Puma thindi has a warehouse ("Office"), and its shops buy raw material from it.
That money is subtracted from each shop but not from the business. So the Reports
screen shows, and the script's result grid repeats:

    Branch 1 + Branch-2 + Office + moved internally = ₹40,000

For example, March in one run:

| | Net profit |
| --- | --- |
| Branch 1 | ₹76,778.80 |
| Branch-2 | ₹59,511.73 |
| Office (cost centre: rent, power, fuel, wholesale stock, three salaries) | −₹1,37,151.53 |
| **Branches together** | **−₹861.00** |
| Moved internally (raw material the shops bought from the Office) | ₹40,861.00 |
| **Business** | **₹40,000.00** |

The daily figures differ on every run, because they are random. The monthly
targets never do.

Shriman amrutulya has one branch and no warehouse. Its business figure and its
branch figure are therefore the same ₹18,000.

### The current month

- The current month's target is exact **at the moment the script runs**. Anything
  you ring up afterwards moves it. Run the script again to re-balance.
- The current month's payslips are **drafts** (the month is not over). Reports
  therefore says wages are provisional.
- Because the month is incomplete, the shops' own figures for it are lower than
  in earlier months. "Needs attention" may list them as falling. The business
  figure is still exact.

## What it writes

Roughly **35,000 counter orders**, about 130 supply orders, 940 expenses, 70
payslips and 1,800 attendance days, for both businesses together.

### Puma thindi

- **Menu.** Eleven new products, plus your own "Masala chai" at your price rather
  than a duplicate. **Surati Locho** is Branch-2's own product (requirement 4).
  **Cutting Chai** is ₹15 everywhere but ₹18 at Branch-2 (a branch price).
- **Counter orders.** About 50–75 a day at each shop, between 7:30 am and 9:30 pm,
  busiest at breakfast and in the evening, and busier at weekends.
  - Monday to Saturday they are rung up by the shop's cashier: Hari at Branch 1,
    Deep at Branch-2. On Sunday, the cashiers' weekly off, the owner rings them up.
  - About one in seventy orders is voided.
  - Today's tokens continue after any you rang up yourself, and the last two are
    still **open**.
- **Day close.** Every past day is closed by the cashier (by the owner on
  Sundays), so those orders can no longer be edited. Today is left open.
- **Supply orders.** Branch 1 orders on Mondays and Thursdays, Branch-2 on
  Tuesdays and Fridays, about ₹2,400 an order. In the history:
  - The warehouse desk accepts, packs and dispatches each order. Ravindra and
    Ravindra1 take turns delivering.
  - About one run in seven has a delay posted by the agent (traffic, vehicle
    trouble or weather).
  - Some orders are cancelled by the shop, and a few are refused by the desk as
    out of stock.
  - For cash on delivery, the agent collects the cash and the desk then confirms
    it. For online payment, the shop gives a UPI reference and the desk verifies it.
- **Orders in progress right now,** so each role has something waiting. The times
  are relative to the moment the script ran:

  | Stage | Shop | Payment | Who it is waiting on |
  | --- | --- | --- | --- |
  | Placed 40 min ago | Branch 1 | Cash on delivery | Warehouse: accept |
  | Placed 25 min ago | Branch-2 | Online, reference not yet checked | Warehouse: verify, accept |
  | Accepted, promised in about 2 hours | Branch 1 | Cash on delivery | Warehouse: pack |
  | Accepted, warehouse posted "short staffed, +45 min" | Branch-2 | Online, not yet checked | Warehouse: verify, pack |
  | Packed, no agent yet | Branch-2 | Cash on delivery | Warehouse: pick an agent, dispatch |
  | On the road, agent posted "traffic, +30 min" | Branch 1 | Online, verified | Ravindra: deliver |
  | On the road | Branch-2 | Cash on delivery | Ravindra1: deliver and confirm the cash |
  | Delivered yesterday, cash collected | Branch 1 | Cash, not yet confirmed | Warehouse: confirm payment |

- **Raw-material catalog.** Ten new, realistically priced items: tea powder,
  refined sugar, elaichi, ginger, milk masala, poha, besan, pav, groundnut oil and
  paper cups. The six items you created are untouched.
- **Expenses.**
  - Each shop: milk every day, a gas cylinder on the 3rd, 13th and 23rd, and petty
    cash four times a month, all logged by the cashier. Rent on the 1st, the
    electricity bill on the 10th and an occasional repair, all logged by the owner.
  - The Office: rent, electricity, delivery-bike fuel on Saturdays, packing
    material, and the **wholesale stock bill on Mondays**, which is where the raw
    material is bought from outside the business.
  - The owner logs all of the Office's costs, because the warehouse desk does not
    hold `expense:log`.
- **Staff.** Two new people with no app login, Ramu Yadav (helper, Branch 1,
  ₹12,000) and Kishan Patel (cook, Branch-2, ₹14,000). They sit beside the five
  who do log in.
- **Attendance.** Every working day (Monday to Saturday, not a holiday) for
  everyone on payroll.
  - Most days: present, punched in at about 8:45–9:15 am and out at about
    8:30–9:30 pm, at the branch's own location.
  - Now and then: absent, on leave or a half day, marked by the owner.
  - Days that already had attendance keep what they had.
- **Payslips.** One per person per month, computed with payroll's own formula.
  Past months are **finalized** and this month is a **draft**.
- **Holiday.** Independence Day, 15 August, business-wide and paid.

### Shriman amrutulya

- The owner is its only member, so **the owner rings up every order** there.
- An eight-item tea-stall menu, about 45–65 orders a day.
- Three staff with no app login: a tea master, a helper and counter staff.
- **No supply orders.** It has no warehouse, so tea powder and sugar are bought at
  the market each Monday and logged as an expense.
- Milk, gas, rent, electricity, petty cash, attendance, payslips, the holiday and
  day closes work as they do for Puma thindi.

## What each login should see

**Owner (vatsaltailor178@gmail.com)**

- **Reports**: choose **12 months** to see all seven, since the default is six.
  - Every month's Net profit is **₹40,000** for Puma thindi.
  - Office is a grey **cost centre** with no sales figure.
  - The sentence under the card reconciles the branches with the total.
- **Reports → All businesses**: Puma thindi ₹40,000 and Shriman amrutulya
  ₹18,000 every month, **₹58,000 combined**.
- Switch to Shriman amrutulya: Branch-1 shows ₹18,000 every month.
- **Staff**: seven months of payslips and attendance for everyone.
- The **month-end export** has something in every month.

**Hari, Branch 1 cashier**

- **Counter**: today's tokens with two still open. **Close day** refuses until
  both are handed over.
- **Supply**: the order history, plus the Branch 1 orders in progress from the
  table above, including one delayed on the road.
- **Expenses**: daily milk and the rest.

**Deep, Branch-2 cashier**

- The same as Hari, for Branch-2.
- **Surati Locho** is on the menu, and a cutting chai rings up at **₹18**.

**Manos, the warehouse desk**

- Two new orders to accept, one of them paid online with a reference to verify.
- An accepted order to pack, and another that the desk itself delayed.
- A packed order waiting for an agent to be picked.
- A delivered cash order whose payment is waiting to be confirmed.
- Beneath those, the history.

**Ravindra, delivery agent**

- One run on the road, with a traffic delay he posted. It was paid online, so
  delivering it asks nothing about cash.
- About half the delivery history.

**Ravindra1, delivery agent**

- One cash-on-delivery run on the road. Marking it delivered asks him to
  **confirm he collected the cash** (requirement 22).
- The other half of the history.

## Settings

The top of the script's DO block:

| Setting | Default | Meaning |
| --- | --- | --- |
| `v_owner_email` | vatsaltailor178@gmail.com | The account that owns both businesses |
| `v_month_count` | 7 | This month and the six before it |
| `v_a_pattern` | `%thindi%` | Finds business A by name (`ILIKE`) |
| `v_a_target` | 40000 | Business A's net profit, every month |
| `v_b_pattern` | `shriman%` | Finds business B by name |
| `v_b_target` | 18000 | Net profit of business B's first branch, every month |
| `v_remove_only` | false | `true` deletes everything the script wrote, then stops |

If a business is renamed, change its pattern. A pattern that matches nothing
stops the script before anything is written.

## Running it again, and removing it

- **Every row the script writes has an id beginning `5eed5eed-`.** The first
  thing each run does is delete those rows, so running it again replaces the
  previous data rather than doubling it. It also re-balances the current month
  around anything you have entered since.
- **To remove it completely**, set `v_remove_only := true` and run the file.
  - Token and order-number counters go back to the last number that still exists.
  - The result grid then comes back empty.
- **It never edits or deletes a row it did not write.** Users, memberships,
  branches, expense categories and everything you entered yourself stay as they
  were, and they count towards the targets.
- **What you do on top of seeded data goes with it.** Delivering a seeded supply
  order or editing a seeded counter order changes that order, and the next run
  or a removal deletes it. A counter order of your own that used a seeded product
  keeps its line, and the line still shows the product's name.

## Limits

- **No notifications** are created. The app writes those when things happen, and
  the history here did not happen through the app. Anything you do after seeding
  notifies as normal.
- Stock usage and wastage, and POS file imports, are not seeded.
- Attendance and payslips go back seven months for people whose accounts are
  newer than that. This is test data.
