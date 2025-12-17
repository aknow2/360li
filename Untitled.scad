$fn=256;

l_hole=21;
rh_size=30;
r_size=27;

difference() {
  union() {
    cylinder(h=7,d=r_size);
    cylinder(h=3,d=rh_size);
  }
  cylinder(h=20,d=l_hole);

}

translate([40,0,0])
difference() {
  union() {
    cylinder(h=20,d=rh_size+7);

  }
  translate([0,0,3])
  cylinder(h=60,d=rh_size+1);
  cylinder(h=20,d=l_hole+1);
}